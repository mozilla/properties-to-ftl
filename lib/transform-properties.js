import { migrateMessage } from './migrate-message.js'
import { parseMessageFiles } from './parse-message-files.js'
import { updateLocalizationFiles } from './update-localization-files.js'
import { findRoot } from './util-find-root.js'

export async function transformProperties(path, options = {}) {
  if (options.dryRun)
    console.warn('--- DRY RUN: Not writing changes to disk.\n')
  if (!options.bug) options.bug = 'xxxxxx'
  if (!options.root) options.root = await findRoot()
  if (!options.root) {
    console.error('Error: Project root not found!')
    process.exit(1)
  }
  console.warn(`Using root: ${options.root}`)

  const propData = await parseMessageFiles(path)

  if (!propData.ftl) {
    console.error(`
Error: No migrations defined!

In order to migrate strings to Fluent, the .properties file must include
FTL metadata comments:

# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar

For more information, see: https://github.com/mozilla/properties-to-ftl#readme
`)
    process.exit(1)
  }

  for (const entry of propData.ast)
    if (entry.type === 'PAIR') migrateMessage(propData, entry.key, [])

  console.warn('')
  await updateLocalizationFiles(propData, options)
}
