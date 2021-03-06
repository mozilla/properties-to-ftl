import { readFile, writeFile } from 'fs/promises'
import { basename, relative } from 'path'
import { print, types, visit } from 'recast'
import { property } from 'safe-identifier'

import { findExternalRefs } from './external-refs.js'
import { migrateMessage } from './migrate-message.js'
import { writeMigrationConfig } from './migration-config.js'
import { parse as jsParse } from './parse-javascript.js'
import { updateLocalizationFiles } from './update-localization-files.js'
import { fail } from './util-fail.js'
import { findRoot } from './util-find-root.js'

const b = types.builders
const n = types.namedTypes

/**
 * @typedef {{
 *   all: boolean,
 *   attrDot: 'first' | 'last' | 'none',
 *   bug?: string,
 *   exclude: string[],
 *   format?: string,
 *   ftlPath?: string,
 *   ftlPrefix?: string,
 *   include: string[],
 *   jsOnly: boolean,
 *   root?: string,
 *   strict: boolean,
 * }} TransformOptions
 */

/**
 *
 * @param {string} jsPath
 * @param {TransformOptions} options
 */
export async function transformJs(jsPath, options = {}) {
  if (!options.root) {
    const found = await findRoot()
    if (!found) {
      fail('Project root not found!')
    }
    options.root = found
  }
  console.warn(`Using root: ${options.root}`)

  // Parse the source JS, XHTML & .properties files
  const ast = jsParse(await readFile(jsPath, 'utf8'))
  const { properties, xhtml } = await findExternalRefs(ast, options)

  let migrationCount = 0
  for (const { ftl, hasMigrateConfig, path } of properties) {
    const relPath = relative(options.root, path)
    if (ftl) {
      migrationCount += 1
      if (!hasMigrateConfig) {
        if (options.jsOnly) {
          fail(
            `JS-only migration requires migration config or --exclude for all .properties files`
          )
        }
        console.warn(`Generating migration config for ${relPath}`)
      }
    } else {
      const why = options.exclude.some((rule) => path.endsWith(rule))
        ? 'matches --exclude'
        : options.include.length === 0 ||
          options.include.some((rule) => path.endsWith(rule))
        ? 'no FTL metadata'
        : 'does not match --include'
      console.warn(`Skipping ${relPath} (${why})`)
    }
  }
  if (migrationCount === 0) {
    fail(`
No migrations defined!

In order to migrate strings to Fluent, the --ftl-path option must be set or
at least one of the .properties files must include FTL metadata comments:

# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar`)
  }
  if (migrationCount > 1 && (options.ftlPath || options.ftlPrefix)) {
    fail(`
Multiple .properties found together with --ftl-path or --ftl-prefix!

When migrating strings from more than one .properties file, they must include
FTL metadata comments directly, and cannot be given as command line arguments:

# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar`)
  }

  const fixmeNodes = new Set()

  const bundleInitMethods = new Set([
    'createBundle', // Services.strings.createBundle()
    'dialogElement', // wrapper for getElementById
    'getElementById' // gets <stringbundle>
  ])
  const bundlePaths = new Map() // ftlPath -> NodePath[]

  // Replace all `Services.strings.createBundle()` calls &
  // `<stringbundle>` getters with `new Localization()` calls.
  visit(ast, {
    visitCallExpression(path) {
      this.traverse(path)
      const { arguments: args, callee } = path.node

      if (
        n.MemberExpression.check(callee) &&
        args.length === 1 &&
        bundleInitMethods.has(callee.property.name)
      ) {
        const fromDOM = callee.property.name !== 'createBundle'
        const key = args[0]
        const keySrc = findSourceLiteral(path.get('arguments', 0))
        if (!keySrc) {
          if (!fromDOM) fixmeNodes.add(key)
        } else {
          let uri = null
          if (fromDOM) {
            let tags = []
            for (const { bundleTags } of xhtml)
              for (const tag of bundleTags)
                if (tag.id === keySrc.value) tags.push(tag)
            if (tags.length === 0) return
            if (tags.length > 1) {
              const { code } = print(path.node)
              console.warn(
                `Found more than one matching <stringbundle> for ${code}`
              )
              fixmeNodes.add(key)
              return
            }
            uri = tags[0].src
          } else uri = keySrc.value

          const prop = properties.find((prop) => prop.uri === uri)
          const ftlPath = prop?.ftlPath
          if (ftlPath && prop.hasMigrateConfig) {
            // new Localization(["foo/bar.ftl"])
            keySrc.value = ftlPath
            path.replace(
              b.newExpression(b.identifier('Localization'), [
                b.arrayExpression([key])
              ])
            )
            if (bundlePaths.has(ftlPath)) bundlePaths.get(ftlPath).push(path)
            else bundlePaths.set(ftlPath, [path])
          }
        }
      }
    }
  })

  // name -> arguments.length
  const fmtMethods = new Map([
    ['GetStringFromName', 1], // Services.strings.createBundle()
    ['formatStringFromName', 2], // Services.strings.createBundle()
    ['getString', 1], // <stringbundle>
    ['getFormattedString', 2] // <stringbundle>
  ])

  // Replace all old-API formatting method calls with Localization calls
  let requiresSync = false
  const msgKeyLiterals = new Map()
  visit(ast, {
    visitCallExpression(path) {
      this.traverse(path)
      const { arguments: args, callee } = path.node

      if (
        n.MemberExpression.check(callee) &&
        fmtMethods.has(callee.property.name)
      ) {
        const { loc, name } = callee.property
        const expArgLength = fmtMethods.get(name)
        if (args.length !== expArgLength) {
          console.warn(
            `Skipping ${name}() on line ${loc?.start.line} (expected ${expArgLength} arguments, found ${args.length})`
          )
          return
        }
        const key = args[0]

        const keySrc = findSourceLiteral(path.get('arguments', 0))
        const fmtArgs = fixFormatterArgs(
          keySrc?.value,
          path.get('arguments', 1)
        )

        /** @type {import('./migrate-message.js').MessageMigration | null} */
        let ftlMsg = null
        if (!keySrc) fixmeNodes.add(key)
        else {
          ftlMsg = msgKeyLiterals.get(keySrc)
          if (!ftlMsg) {
            const propKey = keySrc.value
            const [propData, ...unexpected] = properties.filter((p) =>
              p.msgKeys.includes(propKey)
            )
            if (!propData || unexpected.length > 0) fixmeNodes.add(key)
            else if (propData.ftl) {
              ftlMsg = migrateMessage(propData, propKey, fmtArgs?.names)
              propData.migrate[propKey] = ftlMsg
              let ftlKey = ftlMsg.key
              if (keySrc !== key && ftlMsg.attr) {
                ftlKey += '.' + ftlMsg.attr
                fixmeNodes.add(keySrc)
              } else if (ftlMsg.plural) {
                fixmeNodes.add(keySrc)
              }
              if (propData.hasMigrateConfig) keySrc.value = ftlKey
              msgKeyLiterals.set(keySrc, ftlMsg)
            }
          }
        }

        if (properties.some((pd) => pd.hasMigrateConfig)) {
          const res = setLocalizationCall(path, key, ftlMsg, fmtArgs)
          if (res.fixme) fixmeNodes.add(key)
          if (!res.isAsync) requiresSync = true
        } else if (ftlMsg?.attr && !n.Literal.check(key)) fixmeNodes.add(key)
        if (args[1] && !fmtArgs) fixmeNodes.add(args[1])
      }
    }
  })

  // Replace all remaining exact string matches for .properties messages with Fluent equivalents
  if (!options.strict) {
    visit(ast, {
      visitLiteral(path) {
        this.traverse(path)
        const propKey = path.node.value
        if (!propKey || typeof propKey !== 'string') return

        const [propData, ...unexpected] = properties.filter((p) =>
          p.msgKeys.includes(propKey)
        )
        if (unexpected.length > 0) {
          fixmeNodes.add(path.node)
          return
        }
        if (!propData || !propData.ftl) return

        const ftlMsg = migrateMessage(propData, propKey, null)
        propData.migrate[propKey] = ftlMsg
        let ftlKey = ftlMsg.key
        if (ftlMsg.attr) {
          ftlKey += '.' + ftlMsg.attr
          fixmeNodes.add(path.node)
        }
        if (propData.hasMigrateConfig) path.node.value = ftlKey
      }
    })
  }

  console.warn('\n---')
  const updateL10n = !options.jsOnly
  let updateJS = options.jsOnly
  let updateXHTML = false

  // Update localization files or write their migrate configs
  const migratedUris = []
  if (updateL10n) {
    for (const propData of properties) {
      if (propData.hasMigrateConfig) {
        if (await updateLocalizationFiles(propData, options))
          migratedUris.push(propData.uri)
      } else if (propData.ftl) {
        await writeMigrationConfig(propData, options)
      }
    }
    if (migratedUris.length > 0) {
      updateJS = true
      updateXHTML = true
    }
  }

  // Update XHTML files
  if (updateXHTML) {
    for (const { path, bundleTags, src } of xhtml) {
      let changedSrc = src
      for (const tag of bundleTags)
        if (migratedUris.includes(tag.src))
          changedSrc =
            changedSrc.substring(0, tag.loc.start) +
            changedSrc.substring(tag.loc.end)
      if (changedSrc !== src) {
        await writeFile(path, changedSrc)
        console.warn(`Patched ${relative(options.root, path)}`)
      }
    }
  }

  // Dedupe bundle constructor calls, setting them sync if required
  if (updateJS) {
    for (const [ftlPath, nodePaths] of bundlePaths.entries()) {
      if (nodePaths.length === 1) {
        if (requiresSync) nodePaths[0].node.arguments[1] = b.literal(true)
      } else {
        let name = 'gL10n'
        if (bundlePaths.size > 1) {
          const fn = basename(ftlPath, '.ftl').replace(/\W/g, '')
          name += fn[0].toUpperCase() + fn.substring(1)
        }
        addLocalizationGetter(nodePaths[0], name, ftlPath, requiresSync)
        for (const np of nodePaths) np.replace(b.identifier(name))
      }
    }
  }

  // Add L10N-FIXME comments to places that need human attention
  const fixmeLines = new Set()
  if (fixmeNodes.size > 0) {
    for (const node of fixmeNodes) {
      const comment = b.commentBlock(' L10N-FIXME ', false, true)
      if (node.comments) {
        if (node.comments.every((nc) => !nc.value.includes('L10N-FIXME')))
          node.comments.push(comment)
      } else node.comments = [comment]
      fixmeLines.add(node.loc.start.line)
    }
    if (fixmeLines.size > 0) updateJS = true
  }

  // Update JS file
  if (updateJS) {
    await writeFile(jsPath, print(ast).code)
    console.warn(`Patched ${relative(options.root, jsPath)}`)
    if (fixmeLines.size > 0) {
      console.warn(
        `  !!! Fix L10N-FIXME issues manually near lines:`,
        Array.from(fixmeLines)
      )
      if (migratedUris.length === 0) {
        console.warn(
          `You may run the migration on this file, but these lines will need manual fixes.`
        )
      }
    }
  }
}

function findSourceLiteral(path) {
  if (!path || !path.node) return null

  if (n.Literal.check(path.node)) {
    // 'foo'
    return path.node
  }

  if (n.Identifier.check(path.node)) {
    // foo
    const binding = getLastBinding(path, path.node)
    const decl = binding.parent
    return n.VariableDeclarator.check(decl.node)
      ? findSourceLiteral(decl.get('init'))
      : null
  }

  if (
    n.MemberExpression.check(path.node) &&
    n.Identifier.check(path.node.object) &&
    n.Identifier.check(path.node.property)
  ) {
    // foo.bar
    const binding = getLastBinding(path, path.node.object)
    const decl = binding.parent
    if (
      n.VariableDeclarator.check(decl.node) &&
      n.ObjectExpression.check(decl.node.init)
    ) {
      // foo = { ... }
      const keyName = path.node.property.name
      const { properties } = decl.node.init
      for (let i = 0; i < properties.length; ++i) {
        if (properties[i].key.name === keyName) {
          // foo = { ..., bar: 'value' }
          return findSourceLiteral(decl.get('init', 'properties', i, 'value'))
        }
      }
    }
  }

  // console.warn('FIXME find source literal for:', print(key).code)
  return null
}

/**
 * Finds the array defining the parameters, and transforms it into an object.
 * On success, returns the node to include as the formatter argument.
 */
const fmtArgCache = new WeakMap()
const fmtKeyCache = new Map()
function fixFormatterArgs(key, path) {
  const arg = path.node
  if (!arg) return null
  if (fmtArgCache.has(arg)) return { node: arg, names: fmtArgCache.get(arg) }

  const prevNames = key && fmtKeyCache.get(key)

  if (n.ArrayExpression.check(arg)) {
    if (arg.elements.length === 0) return null
    const names = prevNames || []
    const properties = []
    for (let i = 0; i < arg.elements.length; ++i) {
      const el = arg.elements[i]

      let name
      if (prevNames) name = prevNames[i]
      else {
        name = findParameterName(el)
        if (name) {
          if (/\d+$/.test(name)) {
            const nn = name.replace(/\d+$/, '')
            if (!names.includes(nn)) name = nn
          }
          while (names.includes(name)) name = name + String(i + 1)
        }
        if (!name) name = `var${i + 1}`
        names.push(name)
      }

      const prop = b.objectProperty(b.identifier(name), el)
      if (n.Identifier.check(el) && name === el.name) prop.shorthand = true
      properties.push(prop)
    }
    const node = b.objectExpression(properties)
    fmtArgCache.set(node, names)
    if (key) fmtKeyCache.set(key, names)
    return { node, names }
  }

  if (n.Identifier.check(arg)) {
    // foo
    const binding = getLastBinding(path, arg)

    const decl = binding.parent
    if (n.VariableDeclarator.check(decl.node)) {
      const fixed = fixFormatterArgs(key, decl.get('init'))
      if (fixed) {
        decl.node.init = fixed.node
        return { node: arg, names: fixed.names }
      }
    }
  }

  return null
}

function getLastBinding(path, id) {
  const bindings = path.scope.lookup(id.name)?.getBindings()[id.name]
  /** @type {import('ast-types').NodePath | null} */
  let binding = null
  if (Array.isArray(bindings))
    for (const path of bindings) {
      if (path.value.start > id.start) break
      binding = path
    }
  return binding
}

function findParameterName(node) {
  if (n.Identifier.check(node)) return node.name

  if (n.MemberExpression.check(node) && n.Identifier.check(node.property))
    return node.property.name

  if (n.CallExpression.check(node) && node.arguments.length === 1)
    return findParameterName(node.arguments[0])

  return null
}

function setLocalizationCall(path, key, ftlMsg, fmtArgs) {
  let fmtCall = path.node
  let fixme = false

  let scopeFn = path.parent
  while (scopeFn && !n.Function.check(scopeFn.node)) scopeFn = scopeFn.parent
  const isAsync = !!scopeFn?.node.async

  if (!ftlMsg || !ftlMsg.attr) {
    if (isAsync) {
      // await bundle.formatValue(key, fmtArgs)
      fmtCall.callee.property.name = 'formatValue'
      if (fmtArgs) fmtCall.arguments[1] = fmtArgs.node
      path.replace(b.awaitExpression(fmtCall))
    } else {
      // bundle.formatValueSync(key, fmtArgs)
      fmtCall.callee.property.name = 'formatValueSync'
      if (fmtArgs) fmtCall.arguments[1] = fmtArgs.node
    }
  } else {
    const fmtProps = [b.objectProperty(b.identifier('id'), key)]
    if (fmtArgs)
      fmtProps.push(b.objectProperty(b.identifier('args'), fmtArgs.node))
    fmtCall.arguments = [b.arrayExpression([b.objectExpression(fmtProps)])]

    if (isAsync) {
      // await bundle.formatMessages([{ id: key, args: fmtArgs }])
      fmtCall.callee.property.name = 'formatMessages'
      fmtCall = b.awaitExpression(fmtCall)
    } else {
      // bundle.formatMessagesSync([{ id: key, args: fmtArgs }])
      fmtCall.callee.property.name = 'formatMessagesSync'
    }

    let attr
    if (n.Literal.check(key)) {
      const fa = ftlMsg.attr
      attr = property(null, fa) === fa ? b.identifier(fa) : b.literal(fa)
      key.value = ftlMsg.key
    } else {
      attr = b.identifier('FIXME')
      fixme = true
    }

    path.replace(
      b.memberExpression(
        b.memberExpression(fmtCall, b.identifier('attributes')),
        attr
      )
    )
  }

  return { fixme, isAsync }
}

function addLocalizationGetter(path, name, ftlPath, requiresSync) {
  const utilsPath = getUtilsStatementPath(path)
  const { body } = utilsPath.parent.node
  const insertPos = body.indexOf(utilsPath.node) + 1

  const jsName = JSON.stringify(name)
  const jsFtl = JSON.stringify(ftlPath)
  const ctorArgs = requiresSync ? `${jsFtl}, true` : jsFtl
  const getter = jsParse(
    `
XPCOMUtils.defineLazyGetter(this, ${jsName}, () =>
  new Localization([${ctorArgs}])
);
`
  ).program.body[0]

  body.splice(insertPos, 0, getter)
}

function getUtilsStatementPath(path) {
  const scope = path.scope.lookup('XPCOMUtils')
  let utils = scope?.getBindings()['XPCOMUtils'][0]
  while (utils && !Array.isArray(utils.parent.node.body)) utils = utils.parent
  if (utils) return utils

  // Not found, so let's insert it.

  let program = path
  while (program && program.node.type !== 'Program') program = program.parent
  if (!program) {
    const { code } = print(path.node)
    fail(`Could not find program root from ${code}`)
  }
  const { body } = program.node

  let locPath = path
  while (locPath.node && !locPath.node.loc) locPath = locPath.parent
  const firstUsePos = locPath.node?.loc?.start.line ?? -1
  console.log(locPath.node.loc)

  let insertPos
  for (insertPos = 0; insertPos < body.length; ++insertPos)
    if (body[insertPos].loc?.end.line > firstUsePos) break

  // Parsing is clearer than the corresponding builder calls
  const decl = jsParse(
    `const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");\n`
  ).program.body[0]

  body.splice(insertPos, 0, decl)
  return program.get('body', insertPos)
}
