import { parseLines } from 'dot-properties'

/**
 * @param {string} src
 * @param {string[]} include
 * @param {string[]} exclude
 */
export function parseProperties(src, include, exclude) {
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
