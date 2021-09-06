#!/usr/bin/env node

import { parse } from 'dot-properties'
import { readdir, readFile, stat } from 'fs/promises'
import { relative, resolve } from 'path'
import yargs from 'yargs'

async function getInfo(path) {
  const src = await readFile(path, 'utf8')
  const info = { simple: 0, one: 0, two: 0, more: 0 }
  for (const msg of Object.values(parse(src))) {
    const m = msg.match(/%(\d\$)?|\$/g)
    if (!m) info.simple += 1
    else
      switch (m.length) {
        case 1:
          info.one += 1
          break
        case 2:
          info.two += 1
          break
        default:
          info.more += 1
      }
  }
  return info
}

async function* findPropertiesFiles(root) {
  for (const ent of await readdir(root, { withFileTypes: true })) {
    if (ent.isDirectory()) yield* findPropertiesFiles(resolve(root, ent.name))
    else if (ent.name.endsWith('.properties')) yield resolve(root, ent.name)
  }
}

yargs(process.argv.slice(2))
  .command(
    'list [filename..]',
    'Show information about .properties files',
    {},
    async ({ filename }) => {
      for (const fn of filename) {
        const path = resolve(fn)
        const stats = await stat(path)
        if (stats.isFile())
          console.log(relative('.', path), await getInfo(path))
        else if (stats.isDirectory()) {
          console.log(relative('.', path))
          for await (const pf of findPropertiesFiles(path))
            console.log(' ', relative(path, pf), await getInfo(pf))
        } else throw new Error(`Not a file or directory: ${path}`)
      }
    }
  )
  .help()
  .parse()
