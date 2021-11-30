# Mozilla Properties-to-Fluent Migration Helper

This tool is intended to help automate most parts of moving messages
from `.properties` files in `mozilla-central` to Fluent `.ftl` files.
On the way there, it can also update `.js`, `.jsm` and `.xhtml` files that use these messages,
as well as writing a `.py` migration script for non-English locales.

Because this migration includes a move from indexed to named placeholders/variables,
it's run as a **two-step process**.
On the first run, a `.migration.yaml` config file is generated next to each `.properties` file.
This may then be manually verified and updated before running the same command again,
which then applies the full migration.

## TL;DR

To best learn how all of this works, **play around with it!**
Follow the install/setup instructions until this command runs successfully:

```
npx properties-to-ftl --help
```

Then, find a JS file in `mozilla-central` that uses e.g. `Services.strings.createBundle()`,
and run:

```
npx properties-to-ftl path/to/file.jsm
```

Based on the CLI output,
you might need to first `--include` or `--exclude` some `.properties` file paths
and provide an `--ftl-path` argument in order to generate a `.migration.yaml` file
next to its source `.properties` file.
Open it and the `.js` or `.jsm` file in an editor,
and see if you can resolve the `FIXME` comments.
Then run the same CLI command again to apply your transformation.
Sometimes, everything is already perfect,
but often additional manual work is required to polish up the migration patch.

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

## Hacking It

This is an imperfect tool, because there's a limit to how much it makes sense to automate it.
If/when you encounter issues with it,
you are invited and expected to gauge for yourself how much it's really helping you,
and whether it might make sense to either 1) submit a PR with a fix or 2) just deal with it.

In total, at the time of writing this, there are only about 5000 messages in properties files in mozilla-central,
and many of the corner cases are relatively rarely used.
So if you're encounter a problem,
it may well be easier to fix it directly rather than improving this tool.

Some specific situations are recognised:

- Often moving from `.properties` to Fluent should include a switch from using
  imperative formatting methods to e.g. DOM localization.
  That's a transform that can't really be automated,
  so the best we can do is provide a much more Fluent-ish base for your work.
  Applying the transformation via the JS file should also allow for decent variable name mapping,
  which you'd have to otherwise do manually.

- Much of the code under `devtools/` is using custom wrappers for localization code.
  While these wrappers are not directly supported,
  but it's still possible to force the `properties-to-ftl` JS processor to transform at least the message keys
  by adding a line like this to the file:

  ```js
  Services.strings.createBundle('chrome://fake/locale/foo/bar.properties')
  ```

  and as long as the `bar.properties` filename is unique,
  literal key value strings in that file can get appropriately transformed

- When migrating messages with plural forms,
  the JS calls targeting the `PluralForm` global are not automatically migrated.
  If such messages include `#1`/`#2` variables,
  you need to include their mapping to Fluent variables manually
  in the generated FTL file as well as the Python migration script,
  and remove the wrapping JS code that applies `.replace("#1", ...)` transformations on the result.

- When migrating messages that are used from C++,
  you'll probably need to target the `.properties` file directly,
  and manually fill out more variable names in the migration config.
  Some examples for manually constructing the C++ arguments required by the `Localization` class are available in
  [`TestLocalization.cpp`](https://searchfox.org/mozilla-central/source/intl/l10n/test/gtest/TestLocalization.cpp).
