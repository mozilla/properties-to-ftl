import { Comment } from '@fluent/syntax'
import kebabCase from 'lodash.kebabcase'
import { addFluentPattern } from './add-fluent-pattern.js'

/**
 * @typedef {{ key: string, attr: string | null, varNames: string[] }} MessageMigration
 *
 * @typedef {{
 *   uri: string,
 *   migrate: Record<string, MessageMigration>,
 *   ftlPrefix: string | null,
 *   ftl: import('@fluent/syntax').Resource,
 *   ast: import('dot-properties').Node[]
 * }} PropData
 */

/**
 * Determines the message's FTL interface and returns it as well as
 * updating `propData.migrate`.
 *
 * @param {PropData} propData
 * @param {string} propKey
 * @param {string[]} [varNames]
 * @returns {MessageMigration}
 */
export function migrateMessage(propData, propKey, varNames) {
  if (!varNames) varNames = []
  const { migrate } = propData
  const prev = migrate[propKey]
  if (prev) {
    for (let i = prev.varNames.length; i < varNames.length; ++i)
      prev.varNames[i] = varNames[i]
    return prev
  }

  let key, attr
  const dot = propKey.indexOf('.')
  if (dot === -1) {
    key = propKey
    attr = null
  } else {
    key = propKey.substring(0, dot)
    attr = propKey.substring(dot + 1)
  }

  return (migrate[propKey] = {
    key: getFtlKey(propData, key),
    attr: attr ? kebabCase(attr) : null,
    varNames
  })
}

/**
 * @param {PropData} propData
 * @param {string} propKey
 * @returns {string}
 */
function getFtlKey({ migrate, ftlPrefix, ftl }, key) {
  const attrRoot = `${key}.`
  const prev = Object.keys(migrate).find(
    (m) => m === key || m.startsWith(attrRoot)
  )
  if (prev) return migrate[prev].key

  let ftlKey = kebabCase(`${ftlPrefix}-${key}`)
  const dm = ftlKey.match(/-\d+$/)
  if (dm) {
    // Try to drop numerical suffix
    const bare = ftlKey.substring(0, ftlKey.length - dm[0].length)
    if (!ftlKeyExists(ftl, migrate, bare)) ftlKey = bare
  }
  // If required, add a numerical suffix
  let n = 1
  while (ftlKeyExists(ftl, migrate, ftlKey))
    ftlKey = ftlKey.replace(/(-\d+)?$/, `-${++n}`)

  return ftlKey
}

/**
 * @param {PropData['ftl']} ftl
 * @param {PropData['migrate']} migrate
 * @param {string} key
 * @returns
 */
function ftlKeyExists(ftl, migrate, key) {
  for (const entry of ftl.body)
    if (entry.type === 'Message' && entry.id.name === key) return true
  for (const entry of Object.values(migrate)) if (entry.key === key) return true
  return false
}

/**
 * @param {PropData} propData
 */
export function applyMessageMigration({ ast, ftl, migrate }) {
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
          addFluentPattern(ftl, node, getComment(node.key), migration)
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
