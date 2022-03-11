import { serialize as serializeFluent } from '@fluent/syntax'
import { spawnSync } from 'child_process'
import { stringify as stringifyProperties } from 'dot-properties'
import { constants } from 'fs'
import { access, writeFile } from 'fs/promises'
import { basename, relative, resolve } from 'path'

import { applyMigration } from './apply-migration.js'
import { configPath } from './migration-config.js'
import { stringifyTransform } from './stringify-transform.js'
import { fail } from './util-fail.js'

const emptyPropContents = `# TODO: Remove this file and references to it in jar.mn and elsewhere.\n`

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

  const { format, root } = options
  const relPropPath = relative(root, propData.path)

  const n = Object.keys(propData.migrate).length
  if (n === 0) {
    console.warn(`No strings to migrate from ${relPropPath}`)
    return false
  }

  applyMigration(propData, options)

  const fp = resolve(propData.ftlRoot, propData.ftlPath)
  await writeFile(fp, serializeFluent(propData.ftl))

  let propsEmpty = false
  if (propData.ast.some((node) => node.type === 'PAIR')) {
    let propStr = stringifyProperties(propData.ast, {
      keySep: '=',
      latin1: false,
      lineWidth: null
    })
    if (propStr[propStr.length - 1] !== '\n') propStr += '\n'
    await writeFile(propData.path, propStr)
  } else {
    await writeFile(propData.path, emptyPropContents)
    propsEmpty = true
  }

  // Write migration script
  const ftlName = basename(propData.ftlPath, '.ftl')
  const pyName = `bug_${propData.meta.bug}_${ftlName.replace(/\W/g, '')}.py`
  const pyPath = resolve(root, 'python/l10n/fluent_migrations', pyName)
  await writeFile(pyPath, stringifyTransform(root, propData))
  if (format && typeof format === 'string') {
    const [cmd, ...args] = format.split(' ')
    if (cmd) {
      const fmtCmd = await getFormatterCommand(cmd, root)
      console.warn(`Formatting Python migration script...`)
      try {
        spawnSync(fmtCmd, [...args, pyPath], { stdio: 'inherit' })
      } catch (error) {
        if (error.code === 'ENOENT') {
          fail(`
Python script formatter ${JSON.stringify(format)} not found.

Use the --format option to customize, for example with "python -m black".
Note that this may require installation with:

  pip install black

To disable Python formatting, use --format ''
`)
        } else {
          throw error
        }
      }
      console.warn('\n---')
    }
  }

  const cfgPath = relative(root, configPath(propData.path))
  console.warn(`\
Migrated ${n} ${n === 1 ? 'string' : 'strings'}
  from ${relPropPath}${propsEmpty ? ' (EMPTY)' : ''}
  to   ${relative(root, fp)}
  and  ${relative(root, pyPath)}
The migration config may now be removed:
  ${cfgPath}`)
  if (propsEmpty)
    console.warn(`!!! Manually remove ${relPropPath} and references to it`)

  return true
}

/**
 * @param {string} cmd
 * @param {string} root
 */
async function getFormatterCommand(cmd, root) {
  if (cmd[0] !== '.') return cmd
  try {
    await access(cmd, constants.X_OK)
    return cmd
  } catch {
    const rootCmd = resolve(root, cmd)
    try {
      await access(rootCmd, constants.X_OK)
      return rootCmd
    } catch {
      return cmd
    }
  }
}
