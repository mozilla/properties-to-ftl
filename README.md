# Mozilla Properties-to-Fluent Migration Helper

This tool is intended to help automate most parts of moving messages
from `.properties` files in `mozilla-central` to Fluent `.ftl` files.
On the way there, it can also update `.js`, `.jsm` and `.xhtml` files that use these messages,
as well as writing a `.py` migration script for non-English locales.

Because this migration includes a move from indexed to named placeholders/variables,
it's run as a two-step process.
On the first run, a `.migration.yaml` config file is generated next to each `.properties` file.
This may then be manually verified and updated before running the same command again,
which then applies the full migration.

## Install & Setup

### Node.js

You will need `nodejs` (version 14 or greater) to effectively install and run this tool.
It is recommended that you install `nodejs` via Node Version Manager (`nvm`) to avoid issues with permissions.

The following are installation instructions to install `nodejs` through `nvm`:

https://github.com/nvm-sh/nvm#installing-and-updating

### Python

The helper will generate a Python migration script for non-English locales.
By default, this script will be formatted with [Black](https://black.readthedocs.io/en/stable/),
which you may install with:

```
pip install black
```

To customize or disable the formatting, use the `--format` CLI argument.

### Properties-to-Fluent

```ini
git clone https://github.com/mozilla/properties-to-ftl.git
cd properties-to-ftl
npm install
npm link  # for npx
```

After this setup, the script may be run from anywhere as `npx properties-to-ftl`.

_Note_: If you are having troubles getting `npm link` to run due to invalid permissions, please see the `Node.js Setup` section above for troubleshooting.

## Usage

When migrating legacy messages, multiple things change:

1. The message file extension changes, possible as well as its name.
2. The file's location within `mozilla-central` changes.
3. Message keys change, and often gain an identifying prefix in addition to being kebab-cased.
4. The syntax for referring to variables in messages changes.
5. The JavaScript API for formatting messages changes.

To help with the first three, you need to either use the `--ftl-path` and `--ftl-prefix` options
or add some metadata comments to each `.properties` file that you're migrating:

```ini
# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar
```

These comments don't need to be stored in the repo,
but keeping them there might help if a properties file is migrated in multiple patches.
If using the corresponding command-line arguments
and the `.properties` file is only partially migrated,
these metadata comments will be added to it automatically.

- The `FTL path` may use either the repo root or the `locales/en-US/` directory as its root.
- An `FTL prefix` is not required, but if set, may only contain lower-case letters and dashes: `^[a-z-]+$`.
  If set, it will be included as a prefix for all FTL message keys.

On the first run, a `.migration.yaml` config file is generated next to each `.properties` file.
This may then be manually verified and updated before running the same command again,
which then applies the full migration.

### Command-line arguments

For full usage, run this somewhere in `mozilla-central`:

```ini
npx properties-to-ftl --help
```

When targeting a JS file, it is parsed for `chrome://` references to `.properties` and `.xhtml` files,
which are then parsed in turn.
XHTML may include `<stringbundle>` elements which are detected (and their source `.properties` also parsed),
and properties files may include `FTL path` references, which are also parsed.
All of those files are then modified in-place
once the migration config has been reviewed and the CLI command is run again.

When targeting a `.properties` file, all of its strings are migrated to Fluent.
In this use, JS and XHTML files are not parsed or migrated,
and the placeholder variables are forced to use `var#` names.
These should be individually fixed in the migration config; they will have `# FIXME` comments.

### Your Attention is Required

Because so many things change, it's unlikely that the script will catch everything.
Where possible, a comment `/* L10N-FIXME */` is injected
immediately after points in the JS source that require human attention.

In the generated FTL file, particular care should be given to reviewing the comments,
which will at least approximate the recommended
[metadata structurefor placeholders](https://firefox-source-docs.mozilla.org/l10n/fluent/review.html#comments),
but may not match exactly or be complete.

You will also need to manually make any necessary updates to `jar.mn` manifest files
if a `.properties` file is removed.
Migration config files should not be added to the soruce repository;
they may be safely removed at the end of the migration.
