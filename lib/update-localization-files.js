import { serialize as serializeFluent } from '@fluent/syntax'
import { execFile as execFileCb } from 'child_process'
import { stringify as stringifyProperties } from 'dot-properties'
import { rm, writeFile } from 'fs/promises'
import { basename, relative, resolve } from 'path'
import { promisify } from 'util'

import { applyMigration } from './apply-migration.js'
import { stringifyTransform } from './stringify-transform.js'

const execFile = promisify(execFileCb)

/**
 * Update localization files, overwriting:
 *   - `.properties` source
 *   - `.ftl` target
 *   - `.py` migration script
 *
 * @param {import('./parse-message-files.js').PropData} propData
 * @param {import('./transform-js').TransformOptions} options
 * @returns {Promise<boolean>} If `true`, at least one string was migrated.
 *   If `false`, nothing was written to disk.
 */
export async function updateLocalizationFiles(
  propData,
  { bug, dryRun, format, root, title }
) {
  if (!propData.ftl) return false
  const n = Object.keys(propData.migrate).length
  if (n === 0) {
    console.warn(`No strings to migrate from ${rpp}`)
    return false
  }

  const rpp = relative(root, propData.path)
  const fp = resolve(propData.ftlRoot, propData.ftlPath)

  let pyPath = ''
  let propsRemoved = false
  applyMigration(propData)
  if (dryRun) {
    serializeFluent(propData.ftl)
    stringifyProperties(propData.ast, {
      keySep: '=',
      latin1: false,
      lineWidth: null
    })
    stringifyTransform(root, propData, 'TITLE')
  } else {
    await writeFile(fp, serializeFluent(propData.ftl))

    if (propData.ast.some((node) => node.type === 'PAIR')) {
      let propStr = stringifyProperties(propData.ast, {
        keySep: '=',
        latin1: false,
        lineWidth: null
      })
      if (propStr[propStr.length - 1] !== '\n') propStr += '\n'
      await writeFile(propData.path, propStr)
    } else {
      await rm(propData.path)
      propsRemoved = true
    }

    // Write migration script
    const ftlName = basename(propData.ftlPath, '.ftl')
    const pyTitle = `Bug ${bug} - ${title || ftlName}`
    pyPath = resolve(
      root,
      'python/l10n/fluent_migrations',
      `bug_${bug}_${ftlName.replace(/\W/g, '')}.py`
    )
    await writeFile(pyPath, stringifyTransform(root, propData, pyTitle))
    if (format && typeof format === 'string') {
      const [cmd, ...args] = format.split(' ')
      if (cmd) await execFile(cmd, [...args, pyPath])
    }
  }

  console.warn(`Migrated ${n} ${n === 1 ? 'string' : 'strings'}`)
  console.warn(`  from ${rpp}${propsRemoved ? ' (REMOVED)' : ''}`)
  console.warn(`  to   ${relative(root, fp)}`)
  if (pyPath) console.warn(`  via  ${relative(root, pyPath)}`)
  if (propsRemoved)
    console.warn(`  !!! Manually remove jar.mn reference to ${rpp}`)

  return true
}
