import { serialize as serializeFluent } from '@fluent/syntax'
import assert from 'assert/strict'
import { stringify as stringifyProperties } from 'dot-properties'
import { readFile, writeFile } from 'fs/promises'
import { dirname, relative, resolve } from 'path'
import { parse, print, types, visit } from 'recast'
import { property } from 'safe-identifier'

import { findExternalRefs } from './external-refs.js'
import { migrateMessage } from './migrate-message.js'

const b = types.builders
const n = types.namedTypes

function findSourceLiteral(path) {
  if (!path || !path.node) return null

  if (n.Literal.check(path.node)) {
    // 'foo'
    return path.node
  }

  if (n.Identifier.check(path.node)) {
    // foo
    const scope = path.scope.lookup(path.node.name)
    const [binding] = scope.getBindings()[path.node.name]
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
    const objName = path.node.object.name
    const scope = path.scope.lookup(objName)
    const [binding] = scope.getBindings()[objName]
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

function fixFormatterArgs(done, path) {
  const arg = path.node
  if (!arg || done.has(arg)) return arg

  if (n.ArrayExpression.check(arg)) {
    if (arg.elements.length === 0) return null
    const obj = b.objectExpression(
      arg.elements.map((el, i) =>
        b.objectProperty(b.identifier(`var${i + 1}`), el)
      )
    )
    done.add(obj)
    return obj
  }

  if (n.Identifier.check(arg)) {
    // foo
    const scope = path.scope.lookup(arg.name)
    const [binding] = scope.getBindings()[arg.name]

    const decl = binding.parent
    if (n.VariableDeclarator.check(decl.node)) {
      const fixed = fixFormatterArgs(done, decl.get('init'))
      if (fixed) {
        decl.node.init = fixed
        return arg
      }
    }
  }

  return null
}

function setLocalizationCall(path, key, ftlMsg, fmtArgs) {
  const fmtCall = path.node
  let res = null

  if (!ftlMsg || !ftlMsg.attr) {
    // await bundle.formatValue(key, fmtArgs)
    fmtCall.callee.property.name = 'formatValue'
    if (fmtArgs) fmtCall.arguments[1] = fmtArgs
    path.replace(b.awaitExpression(fmtCall))
  } else {
    // bundle.formatMessages([{ id: key, args: fmtArgs }]).attributes.attr
    fmtCall.callee.property.name = 'formatMessages'
    const fmtProps = [b.objectProperty(b.identifier('id'), key)]
    if (fmtArgs) fmtProps.push(b.objectProperty(b.identifier('args'), fmtArgs))
    fmtCall.arguments = [b.arrayExpression([b.objectExpression(fmtProps)])]

    let attr
    if (n.Literal.check(key)) {
      const fa = ftlMsg.attr
      attr = property(null, fa) === fa ? b.identifier(fa) : b.literal(fa)
      key.value = ftlMsg.key
    } else {
      attr = b.identifier('FIXME')
      res = 'fixme'
    }

    path.replace(
      b.awaitExpression(
        b.memberExpression(
          b.memberExpression(fmtCall, b.identifier('arguments')),
          attr
        )
      )
    )
  }

  let scopeFn = path.parent
  while (scopeFn && !n.Function.check(scopeFn.node)) scopeFn = scopeFn.parent
  if (scopeFn && !scopeFn.node.async) {
    scopeFn.node.async = true
    if (!res) res = 'async'
  }

  return res
}

/**
 * @param {string} jsPath
 */
export async function transformJs(jsPath, { dryRun, root } = {}) {
  if (dryRun) console.warn('DRY RUN: Not writing changes to disk.')
  if (!root) root = await findRoot()
  if (!root) {
    console.error('Error: Project root not found!')
    process.exit(1)
  }
  console.warn(`Using root: ${root}`)

  const code = await readFile(jsPath, 'utf8')
  const ast = parse(code, { tolerant: false })

  const { properties, xhtml } = await findExternalRefs(root, ast)

  for (const props of properties) {
    if (!props.ftl)
      console.warn(`Skipping ${relative(root, props.path)} (No FTL metadata)`)
  }

  if (!properties.some((p) => p.ftl)) {
    console.error('Error: No migrations defined!')
    process.exit(1)
  }

  const fixmeNodes = new Set()
  let didMakeAsync = false

  visit(ast, {
    visitCallExpression(path) {
      this.traverse(path)
      const { arguments: args, callee } = path.node

      if (
        n.MemberExpression.check(callee) &&
        callee.property.name === 'createBundle' &&
        args.length === 1
      ) {
        // Services.strings.createBundle("chrome://...")
        const [key] = args
        const keySrc = findSourceLiteral(path.get('arguments', 0))
        if (!keySrc) fixmeNodes.add(key)
        else {
          const prop = properties.find((prop) => prop.uri === keySrc.value)
          if (prop && prop.ftlPath) {
            // new Localization(["...ftl"])
            keySrc.value = prop.ftlPath
            path.replace(
              b.newExpression(b.identifier('Localization'), [
                b.arrayExpression([key])
              ])
            )
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

  const msgKeyLiterals = new Map()
  const fmtArgObjects = new Set()
  visit(ast, {
    visitCallExpression(path) {
      this.traverse(path)
      const { arguments: args, callee } = path.node

      if (
        n.MemberExpression.check(callee) &&
        fmtMethods.has(callee.property.name)
      ) {
        assert.equal(args.length, fmtMethods.get(callee.property.name))
        const key = args[0]

        /** @type {{ key: string, attr: string | null } | null} */
        let ftlMsg = null
        const keySrc = findSourceLiteral(path.get('arguments', 0))
        if (!keySrc) fixmeNodes.add(key)
        else {
          ftlMsg = msgKeyLiterals.get(keySrc)
          if (!ftlMsg) {
            const propKey = keySrc.value
            const props = properties.filter((p) => p.msgKeys.includes(propKey))
            if (props.length !== 1) fixmeNodes.add(key)
            else if (props[0].ftl) {
              ftlMsg = migrateMessage(props[0], propKey)
              keySrc.value = ftlMsg.key
              if (keySrc !== key && ftlMsg.attr) {
                keySrc.value += '.' + ftlMsg.attr
                fixmeNodes.add(keySrc)
              }
              msgKeyLiterals.set(keySrc, ftlMsg)
            }
          }
        }

        const fmtArgs = fixFormatterArgs(
          fmtArgObjects,
          path.get('arguments', 1)
        )
        const res = setLocalizationCall(path, key, ftlMsg, fmtArgs)
        if (res === 'fixme') fixmeNodes.add(key)
        else if (res === 'async') didMakeAsync = true
        if (args[1] && !fmtArgs) fixmeNodes.add(args[1])
      }
    }
  })

  const fixmeLines = new Set()
  if (fixmeNodes.size > 0) {
    for (const node of fixmeNodes) {
      const comment = b.commentBlock(' L10N-FIXME ', false, true)
      if (node.comments) node.comments.push(comment)
      else node.comments = [comment]
      fixmeLines.add(node.loc.start.line)
    }
  }

  // Update localization files
  console.warn('')
  const migratedUris = []
  for (const props of properties) {
    if (props.ftl) {
      const n = Object.keys(props.migrated).length
      const fp = resolve(props.ftlRoot, props.ftlPath)
      if (n > 0) {
        if (!dryRun) await writeFile(fp, serializeFluent(props.ftl))
        if (!dryRun)
          await writeFile(
            props.path,
            stringifyProperties(props.ast, {
              keySep: '=',
              latin1: false,
              lineWidth: null
            })
          )
        migratedUris.push(props.uri)
      }
      console.warn(`Migrated ${n === 1 ? '1 message' : n + ' messages'}`)
      console.warn(`  from ${relative(root, props.path)}`)
      console.warn(`  to   ${relative(root, fp)}`)
    }
  }

  // Update XHTML files
  for (const { path, bundleTags, src } of xhtml) {
    let changedSrc = src
    for (const tag of bundleTags)
      if (migratedUris.includes(tag.src))
        changedSrc =
          changedSrc.substring(0, tag.loc.start) +
          changedSrc.substring(tag.loc.end)
    if (changedSrc !== src) {
      if (!dryRun) await writeFile(path, changedSrc)
      console.warn(`Patched ${relative(root, path)}`)
    }
  }

  // Update JS file
  if (!dryRun) await writeFile(jsPath, print(ast).code)
  console.warn(`Patched ${relative(root, jsPath)}`)
  if (didMakeAsync)
    console.warn(
      `  !!! Some functions were made async. Check their call sites.`
    )
  if (fixmeLines.size > 0)
    console.warn(
      `  !!! Fix L10N-FIXME issues manually near lines:`,
      Array.from(fixmeLines)
    )
}

async function findRoot(dir = process.cwd()) {
  try {
    const src = await readFile(resolve(dir, 'package.json'))
    const { name } = JSON.parse(src)
    if (name === 'mozilla-central') return dir
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const parent = dirname(dir)
    return parent === dir ? null : findRoot(parent)
  }
}
