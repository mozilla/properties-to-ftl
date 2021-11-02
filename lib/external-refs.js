import { Comment, parse as parseFluent, Resource } from '@fluent/syntax'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { types, visit } from 'recast'
import { resolveChromeUri } from 'resolve-chrome-uri'

import { parseMessageFiles } from './parse-message-files.js'
import { parseStringBundleTags } from './parse-xhtml.js'

const n = types.namedTypes

export async function findExternalRefs(root, ast) {
  /** @type {import('ast-types').NodePath[]} */
  const propertiesUriPaths = []
  /** @type {import('ast-types').NodePath[]} */
  const xhtmlUriPaths = []

  visit(ast, {
    visitLiteral(path) {
      const { value } = path.node
      if (typeof value === 'string' && value.startsWith('chrome://')) {
        if (value.endsWith('.xhtml')) xhtmlUriPaths.push(path)
        if (value.endsWith('.properties')) propertiesUriPaths.push(path)
      }
      this.traverse(path)
    }
  })

  const propUris = new Set(propertiesUriPaths.map((path) => path.node.value))

  /**
   * @type {{
   *   uri: string,
   *   path: string,
   *   bundleTags: { id: string, src: string, loc: { start: number, end: number } }[],
   *   src: string
   * }[]}
   */
  const xhtml = []
  for (const uri of new Set(xhtmlUriPaths.map((path) => path.node.value))) {
    const filePaths = await resolveChromeUri(root, uri)
    if (filePaths.size === 0) console.warn(`Unresolved URI: ${uri}`)
    else {
      for (const fp of filePaths) {
        const src = await readFile(fp, 'utf8')
        const bundleTags = parseStringBundleTags(src)
        if (bundleTags.length > 0) {
          xhtml.push({ uri, path: fp, bundleTags, src })
          for (const tag of bundleTags) propUris.add(tag.src)
        }
      }
    }
  }

  /** @type {import('./parse-message-files.js').PropData[]} */
  const properties = []
  for (const uri of propUris) {
    const filePaths = await resolveChromeUri(root, uri)
    if (filePaths.size === 0) console.warn(`Unresolved URI: ${uri}`)
    else {
      for (const fp of filePaths) {
        const data = await parseMessageFiles(fp)
        data.uri = uri
        properties.push(data)
      }
    }
  }

  return {
    properties,
    propertiesUriPaths,
    xhtml,
    xhtmlUriPaths
  }
}
