#!/usr/bin/env node

import yargs from 'yargs'
import { forEachPropertiesFile, getInfo } from './lib/get-info.js'
import { transformJs } from './lib/transform-js.js'

yargs(process.argv.slice(2))
  .options({
    dryRun: {
      alias: 'n',
      desc: 'Do not write changes to disk',
      type: 'boolean'
    },
    root: {
      alias: 'r',
      desc: 'Root of mozilla-central (usually autodetected)',
      requiresArg: true,
      type: 'string'
    }
  })

  .command(
    '$0 <jsPath>',
    'Convert JS files to use Fluent Localization rather than string bundles',
    {},
    ({ jsPath, dryRun, root }) => transformJs(jsPath, { dryRun, root })
  )

  .command(
    'list [filename..]',
    'Show information about .properties files',
    {},
    (args) => forEachPropertiesFile(args.filename, getInfo)
  )

  .help()
  .epilogue(
    'For more information, see: https://github.com/eemeli/properties-to-ftl'
  )
  .parse()
