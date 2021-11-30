import {
  Attribute,
  Comment,
  Identifier,
  Message,
  Pattern,
  Placeable,
  SelectExpression,
  TextElement,
  VariableReference,
  Variant
} from '@fluent/syntax'

/**
 * @typedef {{ type: 'COPY', source: string }} CopyTransform
 * @typedef {{ type: 'REPLACE', source: string, map: Array<{ from: string, to: string }> }} ReplaceTransform
 * @typedef {{ type: 'PLURALS', source: string, selector: string, map: Array<{ from: string, to: string }> }} PluralsTransform
 * @typedef { CopyTransform | ReplaceTransform | PluralsTransform } PatternTransform
 *
 * @typedef {{
 *   id: string,
 *   value: PatternTransform | null,
 *   attr: Array<{ name: string, transform: PatternTransform }>,
 * }} MessageTransform
 */

/**
 * Builds a Fluent pattern and migration transform from .properties `node` and
 * a `migration` object and adds that to the `ftl` and `transforms` structures,
 * as appropriate for values and attributes.
 *
 * May modify `comment`.
 *
 * @param {import('@fluent/syntax').Resource} ftl
 * @param {MessageTransform[]} transforms
 * @param {import('dot-properties').Pair} node
 * @param {Comment | null} comment
 * @param {import('./migrate-message').MessageMigration} migration
 */
export function addFluentPattern(ftl, transforms, node, comment, migration) {
  const { key, attr } = migration
  /** @type {Message | undefined} */
  let msg = ftl.body.find(
    (entry) => entry.type === 'Message' && entry.id.name === key
  )
  if (!msg) {
    msg = new Message(new Identifier(key), null, [])
    ftl.body.push(msg)
  }

  let mt = transforms.find((mt) => mt.id === key)
  if (!mt) {
    mt = { id: key, value: null, attr: [] }
    transforms.push(mt)
  }

  let cc = comment?.content || ''
  let vc = 'Variables:'
  let hasVar = false
  const pattern = parseMessage(
    node,
    migration,
    (/** @type {string} */ prev, /** @type {string} */ next) => {
      hasVar = true
      let desc = 'FIXME'
      const re = new RegExp(`${prev.replace('$', '\\$')}([^%\n]+)`)
      cc = cc.replace(re, (_, prevDesc) => {
        desc = prevDesc
          .replace(/^\s*(is\s*)?/, '')
          .replace(/\s*[;,.]?\s*$/, '.')
        return ''
      })
      vc += `\n  $${next} (String): ${desc}`
    }
  )
  if (hasVar) {
    const fc = (cc.replace(/\s+\n|\s*$/g, '\n') + vc).trim()
    if (comment) comment.content = fc
    else comment = new Comment(fc)
  }

  if (attr) {
    msg.attributes.push(new Attribute(new Identifier(attr), pattern.ftl))
    if (comment) {
      comment.content = `.${attr}: ${comment.content}`
      if (msg.comment) msg.comment.content += `\n${comment.content}`
      else msg.comment = comment
    }
    mt.attr.push({ name: attr, transform: pattern.transform })
  } else {
    msg.value = pattern.ftl
    if (comment) msg.comment = comment
    mt.value = pattern.transform
  }
}

/**
 * @param {import('dot-properties').Pair} node
 * @param {import('./migrate-message').MessageMigration} migration
 * @param {Function} fixArgNameInComment
 * @returns {{ ftl: Pattern, transform: PatternTransform }}
 */
function parseMessage(
  { key, value },
  { plural, varNames },
  fixArgNameInComment
) {
  if (plural) {
    const sep = value.indexOf(';')
    const caseOne = value.substring(0, sep)
    const caseOther = value.substring(sep + 1)

    /** @type {Variant[]} */
    const variants = []
    /** @type {ReplaceTransform['map'] | null} */
    let map = null

    if (caseOne) {
      const one = parseMsgPattern(caseOne, varNames, fixArgNameInComment)
      variants.push(new Variant(new Identifier('one'), one.ftl, false))
      map = one.map
    }

    const other = parseMsgPattern(caseOther, varNames, fixArgNameInComment)
    variants.push(new Variant(new Identifier('other'), other.ftl, true))
    map = map ? map.concat(other.map) : other.map

    const selector = new VariableReference(new Identifier(plural))
    const selExp = new SelectExpression(selector, variants)
    return {
      ftl: new Pattern([new Placeable(selExp)]),
      transform: { type: 'PLURALS', source: key, selector: plural, map }
    }
  } else {
    const { ftl, map } = parseMsgPattern(value, varNames, fixArgNameInComment)

    /** @type {PatternTransform} */
    const transform =
      Object.keys(map).length === 0
        ? { type: 'COPY', source: key }
        : { type: 'REPLACE', source: key, map }

    return { ftl, transform }
  }
}

/**
 * @param {string} source
 * @param {string[]} varNames
 * @param {Function} fixArgNameInComment
 */
function parseMsgPattern(source, varNames, fixArgNameInComment) {
  /** @type {Array<Placeable|TextElement>} */
  const elements = []
  let done = 0
  let num = 0
  /** @type {ReplaceTransform['map']} */
  const map = []
  for (const match of source.matchAll(/%(\d\$)?S/g)) {
    if (match.index > done)
      elements.push(new TextElement(source.substring(done, match.index)))
    num = match[1] ? parseInt(match[1]) : num + 1
    const name = varNames?.[num - 1] || `var${num}`
    const id = new Identifier(name)
    elements.push(new Placeable(new VariableReference(id)))
    map.push({ from: `%${num}$S`, to: name })
    done = match.index + match[0].length
    fixArgNameInComment(match[0], name)
  }
  if (done < source.length)
    elements.push(new TextElement(source.substring(done)))
  return { ftl: new Pattern(elements), map }
}
