#!/usr/bin/env node

import { extname } from 'path'
import yargs from 'yargs'
import { forEachPropertiesFile, getInfo } from './lib/get-info.js'
import { transformJs } from './lib/transform-js.js'
import { transformProperties } from './lib/transform-properties.js'

yargs(process.argv.slice(2))
  .options({
    all: {
      alias: 'a',
      default: false,
      desc: 'When given a JS file, migrate all messages in .properties file',
      type: 'boolean'
    },
    bug: {
      alias: 'b',
      desc: 'Bugzilla bug id',
      requiresArg: true,
      type: 'string'
    },
    exclude: {
      alias: 'e',
      default: [],
      desc: '.properties files to exclude; should match the file path end',
      requiresArg: true,
      type: 'array'
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
    include: {
      alias: 'i',
      default: [],
      desc: '.properties files to include; should match the file path end',
      requiresArg: true,
      type: 'array'
    },
    'js-only': {
      alias: 'j',
      default: false,
      desc: 'Only migrate JS file',
      type: 'boolean'
    },
    root: {
      alias: 'r',
      desc: 'Root of mozilla-central (usually autodetected)',
      requiresArg: true,
      type: 'string'
    },
    strict: {
      alias: 's',
      default: false,
      desc: 'In JS, require string literals matching message keys to be detected as known method arguments',
      type: 'boolean'
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
