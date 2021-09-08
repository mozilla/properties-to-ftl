import assert from 'assert/strict'
import { readFile } from 'fs/promises'
import kebabCase from 'lodash.kebabcase'
import { basename } from 'path'
import { parse, print, types, visit } from 'recast'
import { property } from 'safe-identifier'

const b = types.builders
const n = types.namedTypes

function findSourceLiteral(path, key) {
  if (!key) return null

  if (n.Literal.check(key)) {
    // 'foo'
    return key
  }

  if (n.Identifier.check(key)) {
    // foo
    const scope = path.scope.lookup(key.name)
    const [binding] = scope.getBindings()[key.name]
    const decl = binding.parent.node
    return n.VariableDeclarator.check(decl)
      ? findSourceLiteral(path, decl.init)
      : null
  }

  if (
    n.MemberExpression.check(key) &&
    n.Identifier.check(key.object) &&
    n.Identifier.check(key.property)
  ) {
    // foo.bar
    const objName = key.object.name
    const scope = path.scope.lookup(objName)
    const [binding] = scope.getBindings()[objName]
    const decl = binding.parent.node
    if (
      n.VariableDeclarator.check(decl) &&
      n.ObjectExpression.check(decl.init)
    ) {
      // foo = { ... }
      const keyName = key.property.name
      for (const prop of decl.init.properties) {
        if (prop.key.name === keyName) {
          // foo = { ..., bar: 'value' }
          return findSourceLiteral(path, prop.value)
        }
      }
    }
  }

  // console.warn('FIXME find source literal for:', print(key).code)
  return null
}

function fixFormatterArgs(prev, path, arg) {
  if (!arg || prev.has(arg)) return arg

  if (n.ArrayExpression.check(arg)) {
    if (arg.elements.length === 0) return null
    const obj = b.objectExpression(
      arg.elements.map((el, i) =>
        b.objectProperty(b.identifier(`var${i + 1}`), el)
      )
    )
    prev.add(obj)
    return obj
  }

  if (n.Identifier.check(arg)) {
    // foo
    const scope = path.scope.lookup(arg.name)
    const [binding] = scope.getBindings()[arg.name]

    const decl = binding.parent.node
    if (n.VariableDeclarator.check(decl)) {
      const fixed = fixFormatterArgs(prev, path, decl.init)
      if (fixed) {
        decl.init = fixed
        return arg
      }
    }

    // console.warn(`Manual fixes needed on or near line ${arg.loc.start.line}`)
  }

  // console.warn('FIXME fix formatter args:', print(arg).code)
  return null
}

function setLocalizationCall(path, key, keySrc, fmtArgs) {
  const fmtCall = path.node
  let res = true

  const dot = keySrc ? keySrc.value.indexOf('.') : -1
  if (dot === -1) {
    // bundle.formatValue(key, fmtArgs)
    fmtCall.callee.property.name = 'formatValue'
    if (fmtArgs) fmtCall.arguments[1] = fmtArgs
  } else {
    // bundle.formatMessages([{ id: key, args: fmtArgs }]).attributes.attr
    fmtCall.callee.property.name = 'formatMessages'
    const fmtProps = [b.objectProperty(b.identifier('id'), key)]
    if (fmtArgs) fmtProps.push(b.objectProperty(b.identifier('args'), fmtArgs))
    fmtCall.arguments = [b.arrayExpression([b.objectExpression(fmtProps)])]

    let attr
    if (key === keySrc) {
      const sa = key.value.substring(dot + 1)
      attr = property(null, sa) === sa ? b.identifier(sa) : b.literal(sa)
      key.value = key.value.substring(0, dot)
    } else {
      attr = b.identifier('FIXME')
      res = false
      // console.warn(`Manual fixes needed on or near line ${key.loc.start.line}`)
    }

    path.replace(
      b.memberExpression(
        b.memberExpression(fmtCall, b.identifier('arguments')),
        attr
      )
    )
  }

  return res
}

/**
 * @param {string} jsPath
 * @param {string} propPath
 * @param {string} ftlPath
 */
export async function transformJs(
  jsPath,
  propPath,
  ftlPath,
  { globals = [], prefix = '' } = {}
) {
  const code = await readFile(jsPath, 'utf8')
  const ast = parse(code, { tolerant: false })

  const propMatch = new RegExp(`^chrome://.*${basename(propPath)}$`)
  const ftlPathParts = ftlPath.split('/')
  const lcIdx = ftlPathParts.indexOf('en-US')
  if (lcIdx !== -1) ftlPath = ftlPathParts.slice(lcIdx + 1).join('/')

  let migratedBundles = 0
  const bundles = []
  const msgKeyLiterals = new Set()
  const fmtArgObjects = new Set()
  const fixmeNodes = new Set()
  visit(ast, {
    visitCallExpression(path) {
      this.traverse(path)
      const { arguments: args, callee } = path.node

      if (
        n.MemberExpression.check(callee) &&
        callee.property.name === 'createBundle' &&
        args.length === 1
      ) {
        const [key] = args
        const keySrc = findSourceLiteral(path, key)
        if (!keySrc) fixmeNodes.add(key)
        else if (propMatch.test(keySrc.value)) {
          // Services.strings.createBundle("chrome://...")
          keySrc.value = ftlPath
          // new Localization(["...ftl"])
          path.replace(
            b.newExpression(b.identifier('Localization'), [
              b.arrayExpression([key])
            ])
          )
          migratedBundles += 1

          const decl = path.parent.node
          if (n.VariableDeclarator.check(decl)) bundles.push(decl.id)
          else if (globals.length === 0)
            throw new Error(
              `Variable binding detection failed: must define --globals`
            )
        }
        return
      }

      if (
        n.MemberExpression.check(callee) &&
        n.Identifier.check(callee.object) &&
        (bundles.some((b) => b.name === callee.object.name) ||
          globals.includes(callee.object.name))
      ) {
        // bundle...
        const bound = callee.object.name
        const scope = path.scope.lookup(bound)
        const bindings = scope && scope.getBindings()[bound]
        if (
          (bindings && bundles.includes(bindings[0].node)) ||
          (!scope && globals.includes(bound))
        ) {
          const keySrc = findSourceLiteral(path, args[0])
          if (!keySrc) fixmeNodes.add(args[0])
          else if (!msgKeyLiterals.has(keySrc)) {
            const keySrcValue = `${prefix}-${keySrc.value}`
            keySrc.value = keySrcValue.split('.').map(kebabCase).join('.')
            msgKeyLiterals.add(keySrc)
          }

          switch (callee.property.name) {
            case 'GetStringFromName': {
              // bundle.GetStringFromName(key: string)
              assert.equal(args.length, 1)
              break
            }
            case 'formatStringFromName': {
              // bundle.formatStringFromName(key: string, values: any[])
              assert.equal(args.length, 2)
              break
            }
            default:
              throw new Error(
                `Unsupported bundle method ${callee.property.name} at line ${callee.loc.start.line}`
              )
          }

          const fmtArgs = fixFormatterArgs(fmtArgObjects, path, args[1])
          const ok = setLocalizationCall(path, args[0], keySrc, fmtArgs)
          if (!ok) fixmeNodes.add(args[0])
          if (args[1] && !fmtArgs) fixmeNodes.add(args[1])
          //console.log(print(path.node).code)
        }
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

  console.error('')
  console.error(`Migrated bundle instances: ${migratedBundles}`)
  console.error(`Migrated messages: ${msgKeyLiterals.size}`)
  if (fixmeLines.size > 0)
    console.error(
      `!!! Manual work needed at or near lines:`,
      Array.from(fixmeLines)
    )
  //console.log(msgKeyLiterals)
  return print(ast).code
}
