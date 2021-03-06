import { Comment, parse as parseFluent, Resource } from '@fluent/syntax'
import { parseLines } from 'dot-properties'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { readMigrationConfig } from './migration-config.js'
import { fail } from './util-fail.js'

/**
 * @typedef {{
 *   uri: string,
 *   path: string,
 *   msgKeys: string[],
 *   attrDot: 'first' | 'last' | 'none',
 *   hasMigrateConfig: boolean,
 *   meta: { bug?: string, title?: string },
 *   migrate: Record<string, import('./migrate-message.js').MessageMigration>,
 *   requiresSync: boolean
 *   ast: import('dot-properties').Node[],
 *   ftl: import('@fluent/syntax').Resource | null,
 *   ftlPath: string | null,
 *   ftlRoot: string | null,
 *   ftlPrefix: string,
 *   ftlTransform: import('./add-fluent-pattern.js').MessageTransform[]
 * }} PropData
 */

/**
 * @param {string} path
 * @param {import('./transform-js.js').TransformOptions} options
 * @returns {Promise<PropData>}
 */
export async function parseMessageFiles(path, options) {
  const exclude =
    options.exclude.some((rule) => path.endsWith(rule)) ||
    (options.include.length > 0 &&
      options.include.every((rule) => !path.endsWith(rule)))
  const src = await readFile(path, 'utf8')
  const ast = parseLines(src, true)
  let msgKeys = ast
    .filter((node) => node.type === 'PAIR')
    .map((pair) => pair.key)
  const cfg = exclude ? null : await readMigrationConfig(options.root, path)
  let ftlRoot, ftlPath, ftlPrefix
  let meta = {}
  let migrate = {}
  if (cfg) {
    ftlRoot = cfg.ftl.root
    ftlPath = cfg.ftl.path
    ftlPrefix = ''
    meta = cfg.meta
    migrate = cfg.migrate
    if (msgKeys.length === 0) msgKeys = Object.keys(cfg.migrate)
  } else if (!exclude) {
    try {
      const fm = getFtlMetadata(path, ast, options)
      ftlRoot = fm.ftlRoot
      ftlPath = fm.ftlPath
      ftlPrefix = fm.ftlPrefix
    } catch (error) {
      fail(error)
    }
  }
  const ftl = exclude ? null : await getFluentResource(ftlRoot, ftlPath)
  return {
    uri: '', // filled in by caller
    path,
    msgKeys,
    attrDot: options.attrDot,
    hasMigrateConfig: !!cfg,
    meta,
    migrate,
    requiresSync: false,
    ast,
    ftl,
    ftlPath,
    ftlRoot,
    ftlPrefix,
    ftlTransform: []
  }
}

/**
 * Looks for comments like:
 *
 *     # FTL path: toolkit/global/unknownContentType.ftl
 *     # FTL prefix: unknowncontenttype
 *
 * @param {string} propPath - The location of the .properties file
 * @param {import('dot-properties').Node[]} ast
 * @param {import('./transform-js.js').TransformOptions} options
 */
function getFtlMetadata(propPath, ast, options) {
  let rawFtlPath = options.ftlPath || null
  let ftlPrefix = options.ftlPrefix || ''

  for (const node of ast) {
    if (node.type === 'COMMENT') {
      const match = node.comment.match(/[!#]\s*FTL\s+(path|prefix):(.*)/)
      if (match)
        switch (match[1]) {
          case 'path': {
            if (rawFtlPath && rawFtlPath !== match[2].trim())
              throw new Error(`FTL path set more than once for ${propPath}`)
            rawFtlPath = match[2].trim()
            break
          }
          case 'prefix':
            if (ftlPrefix && ftlPrefix !== match[2].trim())
              throw new Error(`FTL prefix set more than once for ${propPath}`)
            ftlPrefix = match[2].trim()
            if (/[^a-z-]/.test(ftlPrefix))
              throw new Error(
                `Invalid FTL prefix "${ftlPrefix}" in ${propPath}"`
              )
            break
        }
    }
  }

  const { ftlPath, ftlRoot } = parseFtlPath(propPath, rawFtlPath)
  return { ftlPath, ftlRoot, ftlPrefix }
}

/**
 * @param {string} propPath
 * @param {string} raw
 */
function parseFtlPath(propPath, raw) {
  if (!raw) return { ftlPath: null, ftlRoot: null }

  /** @type {string} */
  let ftlRoot
  const parts = raw.split('/')

  const fi = parts.indexOf('en-US')
  if (fi !== -1) {
    ftlRoot = parts.splice(0, fi + 1).join('/')
  } else {
    const propPathParts = propPath.split('/')
    const i = propPathParts.indexOf('en-US')
    if (i === -1)
      throw new Error(`A full FTL file path is required for ${propPath}`)
    ftlRoot = propPathParts.slice(0, i + 1).join('/')
  }

  const ftlPath = parts.join('/')
  if (!ftlPath.endsWith('.ftl'))
    throw new Error(
      `FTL file path should be fully qualified with an .ftl extension for ${propPath}`
    )

  return { ftlPath, ftlRoot }
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
