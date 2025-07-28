import { readFile } from 'fs/promises'
import { dirname, resolve } from 'path'

/**
 * Finds the mozilla-central root directory.
 *
 * @param {string} [dir]
 * @returns {string}
 */
export async function findRoot(dir = process.cwd()) {
  try {
    const src = await readFile(resolve(dir, 'package.json'))
    const { nonPublishedName: name } = JSON.parse(src)
    if (name === 'mozilla-central') return dir
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const parent = dirname(dir)
    return parent === dir ? null : findRoot(parent)
  }
}
