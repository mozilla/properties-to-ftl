# Mozilla Properties-to-Fluent Migration Helper

This is a hacky tool that mostly works.
Effectively, you point it at a JS file in `mozilla-central`,
and it figures out where and how that file uses messages in `.properties` files,
and converts those to Fluent `.ftl` files.

## Setup

```ini
git clone https://github.com/eemeli/properties-to-ftl.git
cd properties-to-ftl
npm install
npm link  # for npx
```

## Mapping .properties to .ftl

When migrating legacy messages, multiple things change:

1. The message file extension changes, possible as well as its name.
2. The file's location within `mozilla-central` changes.
3. Message keys change, and often gain an identifying prefix in addition to being kebab-cased.
4. The syntax for referring to variables in messages changes.
5. The JavaScript API for formatting messages changes, and becomes async.

To help with the first three, you need to add some metadata comments to each `.properties` file that you're migrating:

```ini
# FTL path: foo/bar/baz.ftl
# FTL prefix: foobar
```

These comments don't need to be stored in the repo,
but keeping them there might help if a properties file is migrated in multiple commits.
The `FTL path` may use either the repo root or the default locale's directory as its root.
An `FTL prefix` is not required, but if set, may only contain lower-case letters and dashes: `^[a-z-]+$`.

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

## Your Attention is Required

Because so many things change, it's unlikely that the script will catch everything.
Where possible, a comment `/* L10N-FIXME */` is injected immediately after points in the source that require human attention.
Additionally, the effects of making functions that contain formatting calls `async` will need to be reviewed.

## TODO

- [ ] Migration script generator
- [ ] Better variable renaming
- [ ] Remove `.properties` files when empty & update `jar.mn`
- [ ] Allow targeting `.properties` files directly
- [ ] Tools for mapping `chrome://` references across the repo
- [ ] Some way of FTL path autodiscovery?
