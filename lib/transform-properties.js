import { migrateMessage } from './migrate-message.js'
import { writeMigrationConfig } from './migration-config.js'
import { parseMessageFiles } from './parse-message-files.js'
import { updateLocalizationFiles } from './update-localization-files.js'
import { fail } from './util-fail.js'
import { findRoot } from './util-find-root.js'

export async function transformProperties(path, options = {}) {
  if (!options.root) {
    const found = await findRoot()
    if (!found) {
      fail('Project root not found!')
    }
    options.root = found
  }
  console.warn(`Using root: ${options.root}`)

  const propData = await parseMessageFiles(path, options)

  if (!propData.ftl) {
    fail(`
No migrations defined!

In order to migrate strings to Fluent, the .properties file must include
FTL metadata comments:

# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar`)
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
