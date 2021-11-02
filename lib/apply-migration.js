import { Comment } from '@fluent/syntax'
import { addFluentPattern } from './add-fluent-pattern.js'

/**
 * @param {import('./external-refs.js').PropData} propData
 */
export function applyMigration({ ast, ftl, ftlTransform, migrate }) {
  let commentLines = []
  const commentNotes = {}

  /**
   * @param {string | null} key
   * @returns {Comment | null}
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
    return key && content ? new Comment(content) : null
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
}
