# Mozilla Properties-to-Fluent Migration Helper

This is a hacky tool that mostly works.
Effectively, you point it at a JS file in `mozilla-central`,
and it figures out where and how that file uses messages in `.properties` files,
and converts those to Fluent `.ftl` files and writes a corresponding migration script.

## Node.js Setup

You will need `nodejs` (version 14 or greater) to effectively install and run this tool.
It is recommended that you install `nodejs` via Node Version Manager (`nvm`) to avoid issues with permissions.

The following are installation instructions to install `nodejs` through `nvm`:

https://github.com/nvm-sh/nvm#installing-and-updating

## Python Setup

The helper will generate a Python migration script for non-English locales.
By default, this script will be formatted with [Black](https://black.readthedocs.io/en/stable/),
which you may install with:

```
pip install black
```

To customize or disable the formatting, use the `--format` CLI argument.

## Properties-to-Fluent Setup

```ini
git clone https://github.com/eemeli/properties-to-ftl.git
cd properties-to-ftl
npm install
npm link  # for npx
```

_Note_: If you are having troubles getting `npm link` to run due to invalid permissions, please see the `Node.js Setup` section above for troubleshooting.

## Mapping .properties to .ftl

When migrating legacy messages, multiple things change:

1. The message file extension changes, possible as well as its name.
2. The file's location within `mozilla-central` changes.
3. Message keys change, and often gain an identifying prefix in addition to being kebab-cased.
4. The syntax for referring to variables in messages changes.
5. The JavaScript API for formatting messages changes.

To help with the first three, you need to add some metadata comments to each `.properties` file that you're migrating:

```ini
# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar
```

These comments don't need to be stored in the repo,
but keeping them there might help if a properties file is migrated in multiple commits.

- The `FTL path` may use either the repo root or the `locales/en-US/` directory as its root.
- An `FTL prefix` is not required, but if set, may only contain lower-case letters and dashes: `^[a-z-]+$`.
  If set, it will be included as a prefix for all FTL message keys.

## Command-line arguments

For full usage, run this somewhere in `mozilla-central`:

```ini
npx properties-to-ftl --help
```

When targeting a JS file, it is parsed for `chrome://` references to `.properties` and `.xhtml` files,
which are then parsed in turn.
XHTML may include `<stringbundle>` elements which are detected (and their source `.properties` also parsed),
and properties files may include `FTL path` references, which are also parsed.
All of those files are then modified in-place.

When targeting a `.properties` file, all of its strings are migrated to Fluent.
In this use, JS and XHTML files are not parsed or migrated,
and the placeholder variables are forced to use `var#` names.

## Your Attention is Required

Because so many things change, it's unlikely that the script will catch everything.
Where possible, a comment `/* L10N-FIXME */` is injected immediately after points in the source that require human attention.

## TODO

- [x] Migration script generator
- [x] Better variable renaming
- [x] Remove `.properties` files when empty
- [ ] Update `jar.mn`
- [x] Allow targeting `.properties` files directly
- [x] Tools for mapping `chrome://` references across the repo
- [ ] Some way of FTL path autodiscovery?
