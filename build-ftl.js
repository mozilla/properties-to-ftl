import {
  Attribute,
  Comment,
  Identifier,
  Message,
  Pattern,
  Placeable,
  Resource,
  TextElement,
  VariableReference
} from '@fluent/syntax'
import kebabCase from 'lodash.kebabcase'

/**
 * @param {Resource | null} res
 * @param {import('dot-properties').Node[]} props
 * @param {{ prefix: string }} options
 */
export function buildFTL(res, props, { prefix = '' } = {}) {
  let comments = []
  const getComment = () => {
    const content = comments.join('\n').trim()
    comments = []
    return content ? new Comment(content) : null
  }

  const getMsgId = (name) => new Identifier(kebabCase(prefix + '-' + name))

  if (!res) res = new Resource()
  for (const node of props) {
    switch (node.type) {
      case 'COMMENT': {
        const line = node.comment.replace(/^[!#]\s*/, '')
        if (!line.startsWith('-*-')) comments.push(line) // ignore mode lines
        break
      }

      case 'EMPTY_LINE': {
        const comment = getComment()
        if (comment) res.body.push(comment)
        break
      }

      case 'PAIR': {
        const comment = getComment()
        const pattern = parseMsgPattern(node.value)

        const dot = node.key.indexOf('.')
        if (dot === -1) {
          const msg = new Message(getMsgId(node.key), pattern, [], comment)
          res.body.push(msg)
        } else {
          const msgId = getMsgId(node.key.substring(0, dot))
          const attrName = kebabCase(node.key.substring(dot + 1))
          const attr = new Attribute(new Identifier(attrName), pattern)

          /** @type {Message} */
          const prev = res.body.find(
            (entry) => entry.type === 'Message' && entry.id.name === msgId.name
          )
          if (prev) {
            prev.attributes.push(attr)
            if (comment) {
              comment.content = `.${id.name}: ${comment.content}`
              if (prev.comment) prev.comment.content += `\n${comment.content}`
              else prev.comment = comment
            }
          } else {
            const msg = new Message(msgId, null, [attr], comment)
            res.body.push(msg)
          }
        }
      }
    }
  }

  const comment = getComment()
  if (comment) res.body.push(comment)
  return res
}

/** @param {string} src */
function parseMsgPattern(src) {
  const elements = []
  let done = 0
  let num = 0
  for (const match of src.matchAll(/%(\d\$)?S/g)) {
    if (match.index > done)
      elements.push(new TextElement(src.substring(done, match.index)))
    num = match[1] ? parseInt(match[1]) : num + 1
    const id = new Identifier(`var${num}`)
    elements.push(new Placeable(new VariableReference(id)))
    done = match.index + match[0].length
  }
  if (done < src.length) elements.push(new TextElement(src.substring(done)))
  return new Pattern(elements)
}
