import kebabCase from 'lodash.kebabcase'
import { fail } from './util-fail.js'

/**
 * @typedef {{
 *   key: string,
 *   attr: string | null,
 *   plural: string | false | null,
 *   varNames: string[]
 * }} MessageMigration
 */

/**
 * Determines the message's FTL interface and returns it.
 *
 * May update `propData.migrate[propKey].varNames` if given additional `varNames`.
 *
 * @param {import('./parse-message-files.js').PropData} propData
 * @param {string} propKey
 * @param {string[] | null} [varNames]
 * @returns {MessageMigration}
 */
export function migrateMessage(propData, propKey, varNames) {
  const { ast, migrate } = propData
  /** @type {import('dot-properties').Pair | undefined} */
  const propNode = ast.find(
    (node) => node.type === 'PAIR' && node.key === propKey
  )
  if (!varNames) varNames = initVarNames(propNode)
  const prev = migrate[propKey]
  if (prev) {
    for (let i = prev.varNames.length; i < varNames.length; ++i) {
      if (propData.hasMigrateConfig) {
        fail(
          `Expected all message variables to be included in migration config: ${propKey}`
        )
      }
      prev.varNames[i] = varNames[i]
    }
    return prev
  }

  if (propData.hasMigrateConfig) {
    fail(`Expected message to be included in migration config: ${propKey}`)
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

  return {
    key: getFtlKey(propData, key),
    attr: attr ? kebabCase(attr) : null,
    plural: propNode?.value?.includes(';') ? 'FIXME' : null,
    varNames
  }
}

/**
 * @param {import('dot-properties').Pair | undefined} node
 */
function initVarNames(node) {
  /** @type {string[]} */
  const varNames = []
  if (node) {
    let num = 0
    for (const match of node.value.matchAll(/%(\d\$)?S/g)) {
      num += 1
      if (match[1]) {
        const n = parseInt(match[1])
        varNames[n - 1] = `var${n}`
      } else {
        varNames.push(`var${num}`)
      }
    }
  }
  return varNames
}

/**
 * @param {import('./parse-message-files.js').PropData} propData
 * @param {string} key
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
