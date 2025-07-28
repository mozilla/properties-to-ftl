#!/usr/bin/env node

import chalk from 'chalk'
import { extname } from 'path'
import yargs from 'yargs'
import { listPropertiesFiles } from './lib/list-properties-files.js'
import { transformJs } from './lib/transform-js.js'
import { transformProperties } from './lib/transform-properties.js'

yargs(process.argv.slice(2))
  .command(
    '$0 <path>',
    'Convert files to use Fluent Localization rather than string bundles',
    {
      all: {
        alias: 'a',
        default: false,
        desc: 'When given a JS file, migrate all messages in .properties file',
        type: 'boolean'
      },
      attrDot: {
        alias: 'd',
        default: 'last',
        describe: 'Consider a dot in a property key to start an attribute name',
        choices: ['first', 'last', 'none']
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
        default: './mach lint --fix',
        type: 'string'
      },
      ftlPath: {
        alias: 'p',
        desc: 'Path to target FTL file, using / as separator',
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
    },
    ({ path, ...options }) =>
      extname(path) === '.properties'
        ? transformProperties(path, options)
        : transformJs(path, options)
  )

  .command(
    'list [filename..]',
    'Show information about .properties files in the given files or directories.',
    {
      varCounts: {
        alias: 'c',
        default: false,
        desc: 'For each .properties file, list message counts by number of variables [no vars, 1 var, 2 vars, ...]',
        type: 'boolean'
      }
    },
    listPropertiesFiles
  )

  .help()
  .showHelpOnFail(
    false,
    chalk.dim(
      `Use --help for available options.\nFor more information, see: https://github.com/mozilla/properties-to-ftl`
    )
  )
  .epilogue(
    chalk.dim(
      'For more information, see: https://github.com/mozilla/properties-to-ftl'
    )
  )
  .parse()
