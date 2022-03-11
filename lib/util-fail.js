import chalk from 'chalk'

/**
 * Log an error message and exit the process.
 *
 * @param {string | Error} error
 * @returns {never}
 */
export function fail(error) {
  let msg = error instanceof Error ? error.message : error.trim()
  if (msg.includes('\n')) msg = '\n' + msg
  console.error(
    chalk.bold.red('\nError:'),
    msg.split('\n').join('\n  '),
    chalk.dim(`

Use --help for available options.
For more information, see: https://github.com/mozilla/properties-to-ftl`)
  )
  process.exit(1)
}
