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

## Install & Setup

You will need Node.js version 14 or greater to use this tool. Then:

```
npm install --global @mozilla/properties-to-ftl
```

After this, the script may be run from anywhere as `properties-to-ftl`.
If you install it locally, use `npx properties-to-ftl` instead.

To verify that setup was successful and see a list of command-line options, run:

```
properties-to-ftl --help
```

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

For full usage, run this command:

```ini
properties-to-ftl --help
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

## Tutorials

To best learn how all of this works, **play around with it!**
Follow the setup instructions,
then find a JS file in `mozilla-central` that calls `Services.strings.createBundle()`,
and run:

```
properties-to-ftl path/to/file.jsm
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

### An Example Migration

As an example, the file `browser/locales/en-US/chrome/browser/feeds/subscribe.properties`
[currently](https://searchfox.org/mozilla-central/rev/131f3af9a49d2203adb7b7ef30dcc37c9f1aa10b/browser/locales/en-US/chrome/browser/feeds/subscribe.properties) contains these messages:

```properties
addProtocolHandlerMessage=Add “%1$S” as an application for %2$S links?
addProtocolHandlerAddButton=Add application
addProtocolHandlerAddButtonAccesskey=A
```

Running the following command will generate a config file `subscribe.migration.yaml` next to it:

```sh
properties-to-ftl --ftl-path protocolhandler.ftl \
  browser/locales/en-US/chrome/browser/feeds/subscribe.properties
```

```yaml
meta:
  bug: xxxxxx # FIXME
  title: Convert subscribe.properties to Fluent

ftl:
  root: browser/locales/en-US
  path: protocolhandler.ftl

migrate:
  addProtocolHandlerMessage: # Add “%1$S” as an application for %2$S links?
    key: add-protocol-handler-message
    varNames:
      - var1 # FIXME
      - var2 # FIXME

  addProtocolHandlerAddButton: # Add application
    key: add-protocol-handler-add-button

  addProtocolHandlerAddButtonAccesskey: # A
    key: add-protocol-handler-add-button-accesskey
```

For a proper migration, a few things ought to be fixed here:

- The bug id needs to be included; this'll be a part of the generated Python migration script's filename.
- The `add-protocol-handler-message` variable names need to be specified.
  In many cases, if the command is run against a `.js` or `.jsm` file, these can be autodetected.
  In this case, based on an inspection of [WebProtocolHandlerRegistrar.jsm](https://searchfox.org/mozilla-central/rev/131f3af9a49d2203adb7b7ef30dcc37c9f1aa10b/browser/components/protocolhandler/WebProtocolHandlerRegistrar.jsm),
  these should probably be `host` and `protocol`.
- The access key ought to be an attribute rather than a separate message.

After these changes, the migration config will look like this:

```yaml
meta:
  bug: 123456
  title: Convert subscribe.properties to Fluent

ftl:
  root: browser/locales/en-US
  path: protocolhandler.ftl

migrate:
  addProtocolHandlerMessage: # Add “%1$S” as an application for %2$S links?
    key: add-protocol-handler-message
    varNames:
      - host
      - protocol

  addProtocolHandlerAddButton: # Add application
    key: add-protocol-handler-add-button

  addProtocolHandlerAddButtonAccesskey: # A
    key: add-protocol-handler-add-button
    attr: accesskey
```

Now running the `properties-to-ftl` command again:

```
properties-to-ftl browser/locales/en-US/chrome/browser/feeds/subscribe.properties
```

finds the config file, and generates a new `protocolhandler.ftl`:

```ftl
add-protocol-handler-message = Add “{ $host }” as an application for { $protocol } links?
add-protocol-handler-add-button = Add application
    .accesskey = A
```

as well as a corresponding `bug_123456_protocolhandler.py` migration script for other locales.

**NOTE:** If these commands were run against `WebProtocolHandlerRegistrar.jsm`
(The only JS file that uses these messages) instead of `subscribe.properties`,
that would have modified its source as well,
automating some of the changes needed there and marking the rest with `/* L10N-FIXME */` comments.

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

## Development

If you do find a reason to fix/improve this tool,
please do file a PR to this repository with your work.

When getting started you'll need to run:

```
git submodule update --init
npm install
```

The `resolve-chrome-uri` dependency is vendored in as a git submodule
because it's honestly too hacky to release for wider use.

The "tests" that are included are a couple of example migration files.
