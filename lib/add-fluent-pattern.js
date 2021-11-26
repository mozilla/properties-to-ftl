import {
  Attribute,
  Comment,
  Identifier,
  Message,
  Pattern,
  Placeable,
  TextElement,
  VariableReference
} from '@fluent/syntax'

/**
 * @typedef {{ type: 'COPY', source: string }} CopyTransform
 * @typedef {{ type: 'REPLACE', source: string, target: string, map: Array<{ from: string, to: string }> }} ReplaceTransform
 * @typedef { CopyTransform | ReplaceTransform } PatternTransform
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
export function addFluentPattern(
  ftl,
  transforms,
  node,
  comment,
  { key, attr, varNames }
) {
  /** @type {Message} */
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

  const pattern = parseMsgPattern(node, varNames, (prev, next) => {
    if (comment) comment.content = comment.content.replace(prev, next)
  })

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
 * @param {string[]} varNames
 * @param {Function} fixArgNameInComment
 */
function parseMsgPattern({ key, value }, varNames, fixArgNameInComment) {
  const elements = []
  let done = 0
  let num = 0
  /** @type {ReplaceTransform['map']} */
  const map = []
  for (const match of value.matchAll(/%(\d\$)?S/g)) {
    if (match.index > done)
      elements.push(new TextElement(value.substring(done, match.index)))
    num = match[1] ? parseInt(match[1]) : num + 1
    const name = varNames?.[num - 1] || `var${num}`
    const id = new Identifier(name)
    elements.push(new Placeable(new VariableReference(id)))
    map.push({ from: `%${num}$S`, to: name })
    done = match.index + match[0].length
    fixArgNameInComment(match[0], `{ $${name} }`)
  }
  if (done < value.length) elements.push(new TextElement(value.substring(done)))

  /** @type {PatternTransform} */
  const transform =
    Object.keys(map).length === 0
      ? { type: 'COPY', source: key }
      : { type: 'REPLACE', source: key, map }

  return { ftl: new Pattern(elements), transform }
}
