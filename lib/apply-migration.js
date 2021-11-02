import { Comment as FluentComment } from '@fluent/syntax'
import {
  Comment as PropComment,
  EmptyLine as PropEmptyLine
} from 'dot-properties'
import { addFluentPattern } from './add-fluent-pattern.js'

/**
 * @param {import('./parse-message-files.js').PropData} propData
 * @param {import('./transform-js').TransformOptions} options
 */
export function applyMigration(
  { ast, ftl, ftlTransform, migrate },
  { ftlPath, ftlPrefix }
) {
  let commentLines = []
  const commentNotes = {}

  /**
   * @param {string | null} key
   * @returns {FluentComment | null}
   */
  const getComment = (key) => {
    let content = commentLines.join('\n').trim()
    commentLines = []
    const ln = content.match(/^LOCALIZATION NOTE\s*(\([^)]*\))?:?\s*(.*)/)
    if (ln) {
      content = ln[2]
      if (ln[1])
        for (const tgt of ln[1].slice(1, -1).split(/[,\s]+/))
          if (tgt) commentNotes[tgt] = content
    } else if (key) {
      const cn = commentNotes[key]
      if (cn) content = content ? cn + '\n' + content : cn
    }
    return key && content ? new FluentComment(content) : null
  }

  let nextCutAfter = -1
  for (let i = 0; i < ast.length; ++i) {
    const node = ast[i]

    switch (node.type) {
      case 'EMPTY_LINE':
        // Comments not immediately before migrated messages are kept
        getComment(null)
        nextCutAfter = i
        break

      case 'COMMENT': {
        const line = node.comment.replace(/^[!#]\s*/, '')
        if (!line.startsWith('-*-')) commentLines.push(line) // ignore mode lines
        break
      }

      case 'PAIR': {
        const migration = migrate[node.key]
        if (migration) {
          addFluentPattern(
            ftl,
            ftlTransform,
            node,
            getComment(node.key),
            migration
          )
          // Cut any empty lines after a migrated message
          while (ast[i + 1]?.type === 'EMPTY_LINE') i += 1
          ast.splice(nextCutAfter + 1, i - nextCutAfter)
          i = nextCutAfter
        } else {
          getComment(null)
          nextCutAfter = i
        }
      }
    }
  }

  if (ftlPath || ftlPrefix) {
    const insert = []
    if (ftlPath) insert.push(new PropComment(`FTL path: ${ftlPath}`))
    if (ftlPrefix) insert.push(new PropComment(`FTL prefix: ${ftlPrefix}`))

    let pos = 0
    while (ast[pos].type === 'COMMENT') pos += 1
    if (pos > 0) insert.unshift(new PropEmptyLine())
    if (ast[pos].type !== 'EMPTY_LINE') insert.push(new PropEmptyLine())

    ast.splice(pos, 0, ...insert)
  }
}
