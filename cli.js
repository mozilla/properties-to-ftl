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
    format: {
      alias: 'f',
      desc: "Command for Python code formatter. Set to '' to disable.",
      default: 'python -m black',
      type: 'string'
    },
    ftlPath: {
      alias: 'p',
      desc: 'Path to target FTL file',
      requiresArg: true,
      type: 'string'
    },
    ftlPrefix: {
      alias: 'x',
      desc: 'Prefix for Fluent message keys',
      requiresArg: true,
      type: 'string'
    },
    ignore: {
      alias: 'i',
      desc: '.properties files to ignore; should match the file path end',
      requiresArg: true,
      type: 'array'
    },
    root: {
      alias: 'r',
      desc: 'Root of mozilla-central (usually autodetected)',
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
    'For more information, see: https://github.com/mozilla/properties-to-ftl'
  )
  .parse()
