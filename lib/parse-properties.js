import { parseLines } from 'dot-properties'

/**
 * @param {string} src
 * @param {string[]} include
 * @param {string[]} exclude
 */
export function parseProperties(src, include = [], exclude = []) {
  const ast = parseLines(src, true)

  if (include.length > 0)
    for (let i = ast.length - 1; i >= 0; --i) {
      const node = ast[i]
      if (node.type === 'PAIR' && !include.includes(node.key)) {
        // Remove all comments & empty lines above a not-included pair
        let prev = i - 1
        while (ast[prev].type !== 'PAIR') prev -= 1
        const rm = ast.splice(prev + 1, i - prev)
        if (rm.length > 1) i -= rm.length - 1
      }
    }

  for (const ex of exclude) {
    const i = ast.findIndex((node) => node.type === 'PAIR' && node.key === ex)
    if (i === -1) throw new Error(`Excluded key not found: ${ex}`)
    // Remove only attached preceding comment above an excluded pair
    let prev = i - 1
    while (ast[prev].type === 'COMMENT') prev -= 1
    ast.splice(prev + 1, i - prev)
  }

  return ast
}

/**
 * Looks for comments like:
 *
 *     # FTL path: toolkit/global/unknownContentType.ftl
 *     # FTL prefix: unknowncontenttype
 *
 * @param {string} propPath - The location of the .properties file
 * @param {import('dot-properties').Node[]} ast
 */
export function getFtlMetadata(propPath, ast) {
  let ftlPath = null
  let ftlRoot = null
  let ftlPrefix = ''
  for (const node of ast) {
    if (node.type === 'COMMENT') {
      const match = node.comment.match(/[!#]\s*FTL\s+(path|prefix):(.*)/)
      if (match)
        switch (match[1]) {
          case 'path': {
            if (ftlPath)
              throw new Error(`FTL path set more than once in ${propPath}`)
            const parts = match[2].trim().split('/')
            const fi = parts.indexOf('en-US')
            if (fi !== -1) {
              ftlRoot = parts.splice(0, fi + 1).join('/')
            } else {
              const propPathParts = propPath.split('/')
              const i = propPathParts.indexOf('en-US')
              if (i === -1)
                throw new Error(
                  `A full FTL file path is required in ${propPath}`
                )
              ftlRoot = propPathParts.slice(0, i + 1).join('/')
            }
            ftlPath = parts.join('/')
            if (!ftlPath.endsWith('.ftl'))
              throw new Error(
                `FTL file path should be fully qualified with an .ftl extension in ${propPath}`
              )
            break
          }
          case 'prefix':
            if (ftlPrefix)
              throw new Error(`FTL prefix set more than once in ${propPath}`)
            ftlPrefix = match[2].trim()
            if (/[^a-z-]/.test(ftlPrefix))
              throw new Error(
                `Invalid FTL prefix "${ftlPrefix}" in ${propPath}"`
              )
            break
        }
    }
  }
  return { ftlPath, ftlRoot, ftlPrefix }
}
