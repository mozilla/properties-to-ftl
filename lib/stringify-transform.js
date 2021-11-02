import { relative } from 'path'

const l10nPath = (root, path) =>
  (path[0] === '/' ? relative(root, path) : path).replace('/locales/en-US', '')

/**
 * Generates a Python migration script from `data.ftlTransform`.
 * Output is ugly, and should be prettified with e.g. black.
 * 
 * @param {import("./external-refs").PropData} data
 * @param {string} title
 */
export function stringifyTransform(
  { root, path, ftlRoot, ftlPath, ftlTransform },
  title
) {
  const source = l10nPath(root, path)
  const target = l10nPath(ftlRoot, ftlPath)

  const helpers = new Set()
  const strTransforms = ftlTransform.map((mt) => {
    const body = [`id=FTL.Identifier(${JSON.stringify(mt.id)})`]
    if (mt.value) body.push(`value=${compilePattern(mt.value, helpers)}`)
    if (mt.attr.length > 0) {
      const attr = []
      for (const { name, transform } of mt.attr) {
        const ns = JSON.stringify(name)
        const cs = compilePattern(transform, helpers)
        attr.push(`FTL.Attribute(id=FTL.Identifier(${ns}), value=${cs})`)
      }
      body.push(`attributes=[${attr.join(', ')}]`)
    }
    return `FTL.Message(${body.join(', ')})`
  })

  return `\
# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import ${Array.from(helpers).sort().join(', ')}

def migrate(ctx):
  """${title}, part {index}."""

  source = ${JSON.stringify(source)}
  target = ${JSON.stringify(target)}
  ctx.add_transforms(target, target, [${strTransforms.join(', ')}])
`
}

/**
 * @param {import('./add-fluent-pattern').PatternTransform} pt
 * @param {Set<string>} helpers
 */
function compilePattern(pt, helpers) {
  const key = JSON.stringify(pt.source)
  switch (pt.type) {
    case 'COPY':
      helpers.add('COPY')
      return `COPY(source, ${key})`
    case 'REPLACE': {
      helpers.add('REPLACE')
      helpers.add('VARIABLE_REFERENCE')
      const replace = pt.map.map(
        ({ from, to }) =>
          `${JSON.stringify(from)}: VARIABLE_REFERENCE(${JSON.stringify(to)})`
      )
      return `REPLACE(source, ${key}, { ${replace.join(', ')} })`
    }
  }
  throw new Error(`Unknown pattern transform ${pt.type}`)
}
