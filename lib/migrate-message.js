import kebabCase from 'lodash.kebabcase'
import { buildFluentMessage } from './build-fluent-message.js'

/**
 * @param {{
 *   uri: string,
 *   migrated: Record<string, { key: string, attr: string | null }>,
 *   ftlPrefix: string | null,
 *   ftl: import('@fluent/syntax').Resource,
 *   ast: import('dot-properties').Node[]
 * }} properties
 * @param {string} propKey
 */
export function migrateMessage({ migrated, ftlPrefix, ftl, ast }, propKey) {
  const prev = migrated[propKey]
  if (prev) return prev

  let attr = null
  const dot = propKey.indexOf('.')
  if (dot !== -1) {
    attr = kebabCase(propKey.substring(dot + 1))
    propKey = propKey.substring(0, dot)
  }

  let ftlKey = kebabCase(`${ftlPrefix}-${propKey}`)
  const dm = ftlKey.match(/-\d+$/)
  if (dm) {
    // Try to drop numerical suffix
    const bare = ftlKey.substring(0, ftlKey.length - dm[0].length)
    if (!resourceHasKey(ftl, bare)) ftlKey = bare
  }
  // If required, add a numerical suffix
  let n = 1
  while (resourceHasKey(ftl, ftlKey))
    ftlKey = ftlKey.replace(/(-\d+)?$/, `-${++n}`)

  // Extract from properties & add to FTL
  const migrate = []
  for (let i = ast.length - 1; i >= 0; --i) {
    const node = ast[i]
    if (
      node.type === 'PAIR' &&
      (node.key === propKey || node.key.startsWith(propKey + '.'))
    ) {
      let prelude = 0
      while (ast[i - prelude - 1].type === 'COMMENT') prelude += 1
      while (ast[i - prelude - 1].type === 'EMPTY_LINE') prelude += 1
      migrate.unshift(...ast.splice(i - prelude, prelude + 1))
      i -= prelude

      const attr = node.key.substring(propKey.length + 1)
      migrated[node.key] = { key: ftlKey, attr: attr ? kebabCase(attr) : null }
    }
  }
  const ftlMsg = buildFluentMessage(ftlKey, migrate)
  ftl.body.push(ftlMsg)

  return { key: ftlKey, attr }
}

function resourceHasKey(res, key) {
  for (const entry of res.body)
    if (entry.type === 'Message' && entry.id.name === key) return true
  return false
}
