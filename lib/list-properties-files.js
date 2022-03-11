import { parse } from 'dot-properties'
import { readdir, readFile, stat } from 'fs/promises'
import { relative, resolve } from 'path'

export async function listPropertiesFiles({ filename = ['.'], varCounts }) {
  for (const root of filename) {
    const path = resolve(root)
    const stats = await stat(path)
    if (stats.isFile()) {
      const relPath = relative('.', path)
      if (varCounts) console.log(relPath, await getInfo(path))
      else console.log(relPath)
    } else if (stats.isDirectory()) {
      const relDir = relative('.', path) || '.'
      console.log(`${relDir}/`)
      for await (const pf of findPropertiesFiles(path)) {
        const relPath = relative(path, pf)
        if (varCounts) console.log(' ', relPath, await getInfo(pf))
        else console.log(' ', relPath)
      }
    } else throw new Error(`Not a file or directory: ${path}`)
  }
}

async function getInfo(path) {
  const src = await readFile(path, 'utf8')
  const info = [0]
  for (const msg of Object.values(parse(src))) {
    const m = msg.match(/%(\d\$)?|\$/g)
    const varCount = m?.length ?? 0
    if (info.length < varCount + 1) {
      const prevLen = info.length
      info.length = varCount + 1
      info.fill(0, prevLen)
    }
    info[varCount] += 1
  }
  return info
}

async function* findPropertiesFiles(root) {
  for (const ent of await readdir(root, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (ent.name.startsWith('obj-')) return
      yield* findPropertiesFiles(resolve(root, ent.name))
    } else if (ent.name.endsWith('.properties')) yield resolve(root, ent.name)
  }
}
