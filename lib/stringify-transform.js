import { relative, resolve } from 'path'

const l10nPath = (root, path) =>
  (path[0] === '/' ? relative(root, path) : path).replace('/locales/en-US', '')

/**
 * Generates a Python migration script from `data.ftlTransform`.
 * Output is ugly, and should be prettified with e.g. black.
 *
 * @param {string} root
 * @param {import('./parse-message-files.js').PropData} data
 * @param {string} title
 */
export function stringifyTransform(
  root,
  { path, ftlRoot, ftlPath, ftlTransform },
  title
) {
  const source = l10nPath(root, path)
  const target = l10nPath(root, resolve(ftlRoot, ftlPath))

  const imports = { helpers: new Set(), transforms: new Set() }
  const strTransforms = ftlTransform.map((mt) => {
    const body = [`id=FTL.Identifier(${JSON.stringify(mt.id)})`]
    if (mt.value) body.push(`value=${compilePattern(mt.value, imports)}`)
    if (mt.attr.length > 0) {
      const attr = []
      for (const { name, transform } of mt.attr) {
        const ns = JSON.stringify(name)
        const cs = compilePattern(transform, imports)
        attr.push(`FTL.Attribute(id=FTL.Identifier(${ns}), value=${cs})`)
      }
      body.push(`attributes=[${attr.join(', ')}]`)
    }
    return `FTL.Message(${body.join(', ')})`
  })

  const importStr = ['import fluent.syntax.ast as FTL']
  for (const [name, set] of Object.entries(imports))
    if (set.size > 0) {
      const ss = Array.from(set).sort()
      importStr.push(`from fluent.migrate.${name} import ${ss.join(', ')}`)
    }

  return `\
# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

${importStr.join('\n')}

def migrate(ctx):
  """${title}, part {index}."""

  source = ${JSON.stringify(source)}
  target = ${JSON.stringify(target)}
  ctx.add_transforms(target, target, [${strTransforms.join(', ')}])
`
}

/**
 * @param {import('./add-fluent-pattern.js').PatternTransform} pt
 * @param {{ helpers: Set<string>, transforms: Set<string>} imports
 */
function compilePattern(pt, imports) {
  const key = JSON.stringify(pt.source)
  switch (pt.type) {
    case 'COPY':
      imports.transforms.add('COPY')
      return `COPY(source, ${key})`
    case 'REPLACE': {
      imports.transforms.add('REPLACE')
      imports.helpers.add('VARIABLE_REFERENCE')
      const replace = pt.map.map(
        ({ from, to }) =>
          `${JSON.stringify(from)}: VARIABLE_REFERENCE(${JSON.stringify(to)})`
      )
      return `REPLACE(source, ${key}, { ${replace.join(', ')} })`
    }
  }
  throw new Error(`Unknown pattern transform ${pt.type}`)
}
