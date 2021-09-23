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
import kebabCase from 'lodash.kebabcase'

/**
 * @param {string} msgName
 * @param {import('dot-properties').Node[]} props
 */
export function buildFluentMessage(msgName, props, propNames) {
  let commentLines = []
  const commentNotes = {}
  const getComment = (key) => {
    let content = commentLines.join('\n').trim()
    commentLines = []
    const ln = content.match(/^LOCALIZATION NOTE\s*(\([^)]*\))?:?\s*(.*)/)
    if (ln) {
      content = ln[2]
      for (const tgt of ln[1].slice(1, -1).split(/[,\s]+/))
        if (tgt && tgt !== key) commentNotes[tgt] = content
    } else {
      const cn = commentNotes[key]
      if (cn) content = content ? cn + '\n' + content : cn
    }
    return content ? new Comment(content) : null
  }

  const msg = new Message(new Identifier(msgName), null, [])

  for (const node of props) {
    switch (node.type) {
      case 'EMPTY_LINE':
        break

      case 'COMMENT': {
        const line = node.comment.replace(/^[!#]\s*/, '')
        if (!line.startsWith('-*-')) commentLines.push(line) // ignore mode lines
        break
      }

      case 'PAIR': {
        const comment = getComment(node.key)
        const pattern = parseMsgPattern(node.value, propNames)

        const dot = node.key.indexOf('.')
        if (dot === -1) {
          msg.value = pattern
          if (comment) msg.comment = comment
        } else {
          const attrName = kebabCase(node.key.substring(dot + 1))
          msg.attributes.push(new Attribute(new Identifier(attrName), pattern))
          if (comment) {
            comment.content = `.${attrName}: ${comment.content}`
            if (msg.comment) msg.comment.content += `\n${comment.content}`
            else msg.comment = comment
          }
        }
      }
    }
  }

  return msg
}

/** @param {string} src */
function parseMsgPattern(src, propNames) {
  const elements = []
  let done = 0
  let num = 0
  for (const match of src.matchAll(/%(\d\$)?S/g)) {
    if (match.index > done)
      elements.push(new TextElement(src.substring(done, match.index)))
    num = match[1] ? parseInt(match[1]) : num + 1
    const name = propNames?.[num - 1] || `var${num}`
    const id = new Identifier(name)
    elements.push(new Placeable(new VariableReference(id)))
    done = match.index + match[0].length
  }
  if (done < src.length) elements.push(new TextElement(src.substring(done)))
  return new Pattern(elements)
}
