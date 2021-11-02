#!/usr/bin/env node

import { extname } from 'path'
import yargs from 'yargs'
import { forEachPropertiesFile, getInfo } from './lib/get-info.js'
import { transformJs } from './lib/transform-js.js'
import { transformProperties } from './lib/transform-properties.js'

yargs(process.argv.slice(2))
  .options({
    bug: {
      alias: 'b',
      desc: 'Bugzilla bug id',
      requiresArg: true,
      type: 'string'
    },
    dryRun: {
      alias: 'n',
      desc: 'Do not write changes to disk',
      type: 'boolean'
    },
    format: {
      alias: 'f',
      desc: "Command for Python code formatter. Set to '' to disable.",
      default: 'python -m black',
      type: 'string'
    },
    root: {
      alias: 'r',
      desc: 'Root of mozilla-central (usually autodetected)',
      requiresArg: true,
      type: 'string'
    },
    title: {
      alias: 't',
      desc: 'Title for migration script name',
      requiresArg: true,
      type: 'string'
    }
  })

  .command(
    '$0 <path>',
    'Convert files to use Fluent Localization rather than string bundles',
    {},
    ({ path, ...options }) =>
      extname(path) === '.properties'
        ? transformProperties(path, options)
        : transformJs(path, options)
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
