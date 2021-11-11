import { serialize as serializeFluent } from '@fluent/syntax'
import { execFile as execFileCb } from 'child_process'
import { stringify as stringifyProperties } from 'dot-properties'
import { rm, writeFile } from 'fs/promises'
import { basename, relative, resolve } from 'path'
import { promisify } from 'util'

import { applyMigration } from './apply-migration.js'
import { configPath } from './migration-config.js'
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
export async function updateLocalizationFiles(propData, options) {
  if (!propData.ftl) return false
  const n = Object.keys(propData.migrate).length
  if (n === 0) {
    const rpp = relative(options.root, propData.path)
    console.warn(`No strings to migrate from ${rpp}`)
    return false
  }

  applyMigration(propData, options)

  const { bug, format, root, title } = options

  const rpp = relative(root, propData.path)
  const fp = resolve(propData.ftlRoot, propData.ftlPath)
  await writeFile(fp, serializeFluent(propData.ftl))

  let propsRemoved = false
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
  const pyPath = resolve(
    root,
    'python/l10n/fluent_migrations',
    `bug_${bug}_${ftlName.replace(/\W/g, '')}.py`
  )
  await writeFile(pyPath, stringifyTransform(root, propData, pyTitle))
  if (format && typeof format === 'string') {
    const [cmd, ...args] = format.split(' ')
    if (cmd) await execFile(cmd, [...args, pyPath])
  }

  const cfgPath = relative(root, configPath(propData.path))
  console.warn(`\
Migrated ${n} ${n === 1 ? 'string' : 'strings'}
  from ${rpp}${propsRemoved ? ' (REMOVED)' : ''}
  to   ${relative(root, fp)}
  and  ${relative(root, pyPath)}
The migration config may now be removed:
  ${cfgPath}`)
  if (propsRemoved)
    console.warn(`  !!! Manually remove jar.mn reference to ${rpp}`)

  return true
}
