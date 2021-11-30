import { migrateMessage } from './migrate-message.js'
import { writeMigrationConfig } from './migration-config.js'
import { parseMessageFiles } from './parse-message-files.js'
import { updateLocalizationFiles } from './update-localization-files.js'
import { findRoot } from './util-find-root.js'

export async function transformProperties(path, options = {}) {
  if (!options.root) {
    const found = await findRoot()
    if (!found) {
      console.error('Error: Project root not found!')
      process.exit(1)
    }
    options.root = found
  }
  console.warn(`Using root: ${options.root}`)

  const propData = await parseMessageFiles(path, options)

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

  console.warn('\n---')
  if (propData.hasMigrateConfig) {
    await updateLocalizationFiles(propData, options)
  } else {
    for (const entry of propData.ast)
      if (entry.type === 'PAIR')
        propData.migrate[entry.key] = migrateMessage(propData, entry.key, null)
    await writeMigrationConfig(propData, options)
  }
}
