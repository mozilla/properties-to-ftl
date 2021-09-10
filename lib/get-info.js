import { parse } from 'dot-properties'
import { readdir, readFile, stat } from 'fs/promises'
import { relative, resolve } from 'path'

export async function getInfo(path) {
  const src = await readFile(path, 'utf8')
  const info = [0, 0, 0, 0]
  for (const msg of Object.values(parse(src))) {
    const m = msg.match(/%(\d\$)?|\$/g)
    const idx = m ? Math.min(m.length, 3) : 0
    info[idx] += 1
  }
  return info
}

export async function forEachPropertiesFile(roots, cb) {
  for (const root of roots) {
    const path = resolve(root)
    const stats = await stat(path)
    if (stats.isFile()) {
      const res = await cb(path)
      if (res) console.log(relative('.', path), res)
    } else if (stats.isDirectory()) {
      console.log(relative('.', path))
      for await (const pf of findPropertiesFiles(path)) {
        const res = await cb(pf)
        if (res) console.log(' ', relative(path, pf), res)
      }
    } else throw new Error(`Not a file or directory: ${path}`)
  }
}

async function* findPropertiesFiles(root) {
  for (const ent of await readdir(root, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (ent.name.startsWith('obj-')) return
      yield* findPropertiesFiles(resolve(root, ent.name))
    } else if (ent.name.endsWith('.properties')) yield resolve(root, ent.name)
  }
}
