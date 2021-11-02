import { Comment, parse as parseFluent, Resource } from '@fluent/syntax'
import { parseLines } from 'dot-properties'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { types, visit } from 'recast'
import { resolveChromeUri } from 'resolve-chrome-uri'

import { getFtlMetadata } from './parse-properties.js'
import { parseStringBundleTags } from './parse-xhtml.js'

/**
 * @typedef {{
 *   root: string,
 *   uri: string,
 *   path: string,
 *   msgKeys: string[],
 *   migrate: Record<string, import('./migrate-message.js').MessageMigration>,
 *   requiresSync: boolean
 *   ast: import('dot-properties').Node[],
 *   ftl: import('@fluent/syntax').Resource,
 *   ftlPath: string | null,
 *   ftlRoot: string | null,
 *   ftlPrefix: string,
 *   ftlTransform: import('./add-fluent-pattern.js').MessageTransform[]
 * }} PropData
 */

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

  /** @type {PropData[]} */
  const properties = []
  for (const uri of propUris) {
    const filePaths = await resolveChromeUri(root, uri)
    if (filePaths.size === 0) console.warn(`Unresolved URI: ${uri}`)
    else {
      for (const fp of filePaths) {
        const src = await readFile(fp, 'utf8')
        const ast = parseLines(src, true)
        const msgKeys = ast
          .filter((node) => node.type === 'PAIR')
          .map((pair) => pair.key)
        const { ftlPath, ftlRoot, ftlPrefix } = getFtlMetadata(fp, ast)
        const ftl = await getFluentResource(ftlRoot, ftlPath)
        properties.push({
          root,
          uri,
          path: fp,
          msgKeys,
          migrate: {},
          requiresSync: false,
          ast,
          ftl,
          ftlPath,
          ftlRoot,
          ftlPrefix,
          ftlTransform: []
        })
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

const mplLicenseHeader = `
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.`.trim()

async function getFluentResource(root, localPath) {
  const path = root && localPath && resolve(root, localPath)
  if (!path) return null
  if (existsSync(path)) {
    const src = await readFile(path, 'utf8')
    return parseFluent(src, { withSpans: true })
  }
  return new Resource([new Comment(mplLicenseHeader)])
}
