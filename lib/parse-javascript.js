import { parse as acornParse } from 'acorn'
import { parse as recastParse } from 'recast'

/**
 * Manually wrap acorn parser in order to support latest ES features.
 * https://github.com/benjamn/recast/issues/578
 */
function acornWrap(source) {
  const comments = []
  const tokens = []
  const ast = acornParse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    onComment: comments,
    onToken: tokens
  })
  if (!ast.comments) ast.comments = comments
  if (!ast.tokens) ast.tokens = tokens
  return ast
}

export const parse = (code) =>
  recastParse(code, { parser: { parse: acornWrap } })
