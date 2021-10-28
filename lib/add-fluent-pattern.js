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
 * Builds a Fluent pattern from .properties `node` and a `migration` object and
 * adds that to the `ftl` structure, as appropriate for values and attributes.
 *
 * May modify `comment`.
 *
 * @param {PropData['ftl']} ftl
 * @param {import('dot-properties').Node} node
 * @param {Comment | null} comment
 * @param {MessageMigration} migration
 */
export function addFluentPattern(ftl, node, comment, { key, attr, varNames }) {
  /** @type {Message} */
  let msg = ftl.body.find(
    (entry) => entry.type === 'Message' && entry.id.name === key
  )
  if (!msg) {
    msg = new Message(new Identifier(key), null, [])
    ftl.body.push(msg)
  }

  const pattern = parseMsgPattern(node.value, varNames, (prev, next) => {
    if (comment) comment.content = comment.content.replace(prev, next)
  })

  if (attr) {
    msg.attributes.push(new Attribute(new Identifier(attr), pattern))
    if (comment) {
      comment.content = `.${attr}: ${comment.content}`
      if (msg.comment) msg.comment.content += `\n${comment.content}`
      else msg.comment = comment
    }
  } else {
    msg.value = pattern
    if (comment) msg.comment = comment
  }
}

/**
 * @param {string} src
 * @param {string[] | null} argNames
 * @param {Function} fixArgNameInComment
 * @returns
 */
function parseMsgPattern(src, argNames, fixArgNameInComment) {
  const elements = []
  let done = 0
  let num = 0
  for (const match of src.matchAll(/%(\d\$)?S/g)) {
    if (match.index > done)
      elements.push(new TextElement(src.substring(done, match.index)))
    num = match[1] ? parseInt(match[1]) : num + 1
    const name = argNames?.[num - 1] || `var${num}`
    const id = new Identifier(name)
    elements.push(new Placeable(new VariableReference(id)))
    done = match.index + match[0].length
    fixArgNameInComment(match[0], `{ $${name} }`)
  }
  if (done < src.length) elements.push(new TextElement(src.substring(done)))
  return new Pattern(elements)
}
