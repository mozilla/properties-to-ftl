import kebabCase from 'lodash.kebabcase'

/**
 * @typedef {{ key: string, attr: string | null, varNames: string[] }} MessageMigration
 * @typedef {import('./external-refs').PropData} PropData
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
 * @param {import('@fluent/syntax').Resource} ftl
 * @param {Record<string, MessageMigration>} migrate
 * @param {string} key
 * @returns
 */
function ftlKeyExists(ftl, migrate, key) {
  for (const entry of ftl.body)
    if (entry.type === 'Message' && entry.id.name === key) return true
  for (const entry of Object.values(migrate)) if (entry.key === key) return true
  return false
}
