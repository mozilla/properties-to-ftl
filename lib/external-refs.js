import { readFile } from 'fs/promises'
import { visit } from 'recast'
import { resolveChromeUri } from '../resolve-chrome-uri/index.js'

import { parseMessageFiles } from './parse-message-files.js'
import { parseStringBundleTags } from './parse-xhtml.js'

/**
 * @param {unknown} ast
 * @param {import('./transform-js.js').TransformOptions} options
 */
export async function findExternalRefs(ast, options) {
  /** @type {import('ast-types').NodePath[]} */
  const propertiesUriPaths = []
  /** @type {import('ast-types').NodePath[]} */
  const xhtmlUriPaths = []

  visit(ast, {
    visitLiteral(path) {
      const { value } = path.node
      if (typeof value === 'string' && value.startsWith('chrome://')) {
        if (value.endsWith('.xhtml')) {
          if (
            options.exclude.every((exclude) => !value.endsWith(exclude)) &&
            (options.include.length === 0 ||
              options.include.some((include) => value.endsWith(include)))
          )
            xhtmlUriPaths.push(path)
        }
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
    const filePaths = await getFilePaths(options.root, uri)
    if (!filePaths || filePaths.size === 0) {
      console.warn(`Unresolved URI: ${uri}`)
    } else {
      for (const fp of filePaths) {
        const src = await readFile(fp, 'utf8')
        const bundleTags = parseStringBundleTags(src)
        if (bundleTags.length > 0) {
          xhtml.push({ uri, path: fp, bundleTags, src })
          for (const tag of bundleTags) {
            if (
              options.exclude.every((exclude) => !tag.src.endsWith(exclude)) &&
              (options.include.length === 0 ||
                options.include.some((include) => tag.src.endsWith(include)))
            )
              propUris.add(tag.src)
          }
        }
      }
    }
  }

  /** @type {import('./parse-message-files.js').PropData[]} */
  const properties = []
  for (const uri of propUris) {
    const filePaths = await getFilePaths(options.root, uri)
    if (!filePaths || filePaths.size === 0) {
      console.warn(`Unresolved URI: ${uri}`)
    } else {
      for (const fp of filePaths) {
        const data = await parseMessageFiles(fp, options)
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

async function getFilePaths(root, uri) {
  try {
    return await resolveChromeUri(root, uri)
  } catch {
    return null
  }
}
