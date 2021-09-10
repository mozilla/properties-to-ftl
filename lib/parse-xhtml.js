/**
 * Uses regexp because actual file contents appear sufficiently regular for it.
 *
 * @param {string} xhtml
 * @returns
 */
export function parseStringBundleTags(xhtml) {
  const res = []
  for (const tag of xhtml.matchAll(
    /[ \t]*<stringbundle\b([^>]*)\/>(\s*\n)?/g
  )) {
    let id = null
    let src = null
    const loc = { start: tag.index, end: tag.index + tag[0].length }
    for (const prop of tag[1].trim().split(/\s+/)) {
      const m = prop.match(/^(id|src)="(.+)"$/)
      switch (m && m[1]) {
        case 'id':
          id = m[2]
          break
        case 'src':
          src = m[2]
          break
        default:
          throw new Error(`Parse error with: ${tag[0]}`)
      }
    }
    if (!id || !src) throw new Error(`Parse error with: ${tag[0]}`)
    res.push({ id, src, loc })
  }
  return res
}
