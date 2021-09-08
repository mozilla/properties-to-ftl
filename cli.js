#!/usr/bin/env node

import { parse as parseFluent, serialize } from '@fluent/syntax'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import yargs from 'yargs'

import { buildFTL } from './build-ftl.js'
import { forEachPropertiesFile, getInfo, getVars } from './get-info.js'
import { parseProperties } from './parse-properties.js'
import { transformJs } from './transform-js.js'

yargs(process.argv.slice(2))
  .options({
    ftl: {
      alias: 'f',
      desc: 'Target Fluent file. If empty, stdout is used.',
      requiresArg: true,
      type: 'string'
    },
    props: {
      alias: 'p',
      desc: 'Source properties file',
      requiresArg: true,
      type: 'string'
    },
    globals: {
      alias: 'g',
      default: [],
      desc: 'Global variables that are presumed to be bundles.',
      requiresArg: true,
      type: 'array'
    },
    prefix: {
      alias: 'k',
      default: '',
      desc: 'Prefix for FTL message keys',
      requiresArg: true,
      type: 'string'
    },
    include: {
      alias: 'i',
      default: [],
      desc: 'Keys to include. If empty, all are included.',
      requiresArg: true,
      type: 'array'
    },
    exclude: {
      alias: 'e',
      default: [],
      desc: 'Keys to exclude. If empty, all are included.',
      requiresArg: true,
      type: 'array'
    }
  })

  .command(
    '$0',
    'Convert .properties to .ftl',
    { props: { demandOption: true } },
    async ({ ftl, props, prefix, include, exclude }) => {
      const src = await readFile(props, 'utf8')
      const ast = parseProperties(src, include, exclude)

      /** @type {import('@fluent/syntax').Resource} */
      let res = null
      if (ftl && existsSync(ftl)) {
        const ftlSrc = await readFile(ftl, 'utf8')
        res = parseFluent(ftlSrc, { withSpans: true })
      }
      res = buildFTL(res, ast, { prefix })

      if (ftl) await writeFile(ftl, serialize(res))
      else console.log(serialize(res))
    }
  )

  .command(
    'js <jsPath>',
    'Convert JS files to use Fluent Localization rather than string bundles',
    { ftl: { demandOption: true }, props: { demandOption: true } },
    async ({ ftl, jsPath, props, globals, prefix }) => {
      const code = await transformJs(jsPath, props, ftl, { globals, prefix })
      console.log(code)
    }
  )

  .command(
    'list [filename..]',
    'Show information about .properties files',
    {},
    (args) => forEachPropertiesFile(args.filename, getInfo)
  )

  .command(
    'vars [filename..]',
    'Show variables used in .properties files',
    {},
    (args) => forEachPropertiesFile(args.filename, getVars)
  )

  .help()
  .parse()
