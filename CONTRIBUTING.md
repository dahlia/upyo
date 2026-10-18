<!-- deno-fmt-ignore-file -->

Contributing to Upyo
====================

First of all, thank you for considering contributing to Upyo! We welcome any
contributions, from bug reports and documentation improvements to new features
and transport implementations. This document provides some guidelines for
contributing to the project.

If you have any questions, please feel free to open an issue or join our
community discussions.


Reporting security issues
-------------------------

Please do not report security vulnerabilities through public issues.  See
[*SECURITY.md*](./SECURITY.md) for supported versions and private reporting
instructions.


Getting started
---------------

Upyo is a monorepo that uses [mise] to install the required runtimes, install
project dependencies, and run development tasks. To get started, you'll need
to have [mise] installed on your system.

1.  **Fork and clone the repository**

    ~~~~ bash
    git clone https://github.com/YOUR_USERNAME/upyo.git
    cd upyo
    ~~~~

2.  **Install dependencies**

    ~~~~ bash
    mise install
    ~~~~

    This installs Node.js 24, Bun, pnpm, and tools such as Sacho and Hongdown,
    then installs project dependencies (including Oxlint and Oxfmt) and sets
    up the Git hooks used by the project and Sacho. Deno is installed only when
    you run a Deno or JSR task.

If `core.hooksPath` is configured, setup leaves your hooks untouched and
configures Sacho's merge drivers. Integrate `mise run pre-commit` and Sacho's
`commit-msg` and `reference-transaction` hook commands with your existing
hook manager. The shell snippets are in the `hooks:install` task in
*mise.toml*.

[mise]: https://mise.jdx.dev/


Development
-----------

Use mise tasks for development workflows. Node.js 24 runs the maintenance
scripts and the default tests. This development requirement is separate from
the library's supported runtime versions.

 -  `mise run build` builds all npm packages. Run `mise :build` inside a package
    to build that package.
 -  `mise run test` runs repository script tests and package tests with Node.js.
    Run `mise :test` inside a package for its Node.js tests.
 -  `mise run check` runs the TypeScript source check (`mise run check:types`),
    Oxlint, formatting checks, version checks, script tests, and workflow lint.
    It is also the pre-commit check and needs no Deno installation.
 -  `mise run fmt` formats code and JSON with Oxfmt, Markdown with Hongdown,
    and mise configuration with mise. It does not sort imports or package
    fields. Oxfmt excludes *docs/*; Hongdown formats its Markdown.
 -  `mise run check:pack` builds and packs npm packages under *tmp/npm/* without
    publishing them.

### Cross-runtime compatibility

Deno remains supported, and packages are still published to both JSR and npm.
Deno and JSR tasks activate the pinned Deno version on demand. From the
repository root:

 -  `mise run check:deno` checks Deno source compatibility.
 -  `mise run check:jsr` validates JSR publication without publishing.
 -  `mise run check:all` runs the development checks and both compatibility
    checks.
 -  `mise run test:deno` and `mise run test:bun` run the respective runtime
    suites. Deno's task also accepts `--coverage` and `--junit-path`.
 -  `mise run test:edge` tests the built MIME package in workerd.
 -  `mise run test:all` runs the package tests across Deno, Node.js, Bun, and
    workerd. Package-local `mise :test:all` runs Deno, Node.js, and Bun tests.

Within a package, `mise :test:deno` uses the same pinned version. Root checks
there need the `//:` prefix, for example `mise run //:check:deno` or
`mise run //:check:jsr`.

Run `mise run check:all`, `sacho check`, `mise run test:all`, and
`mise run docs:build` before submitting a change. External provider tests
need environment variables; see each package's test instructions.

### Editors

The VS Code workspace recommends the Oxc extension for linting and formatting.
With a TypeScript file open, run `TypeScript: Select TypeScript Version...`
from the Command Palette and select the workspace version. For Zed, install
the Oxc extension; the workspace settings use vtsls for types and Oxc for
linting and formatting. Neither setup needs the Deno language server for
ordinary development.

Run `mise run build` before working across packages in an editor: editor
projects resolve workspace dependencies through their built declarations.
`mise run check:types` separately checks all workspace source without requiring
a previous build. See [the tooling notes] for compiler versions and lint rule
coverage.

[the tooling notes]: scripts/README.md


Adding a new transport
----------------------

To add a new transport, you can create a new package in the *packages/*
directory. The easiest way to do this is to copy an existing transport package
(e.g., *packages/mailgun/*) and modify it.

Each transport package should contain the following:

 -  *deno.json*: Deno configuration file.
 -  *package.json*: Node.js package configuration file.
 -  *tsdown.config.ts*: Configuration for `tsdown`, which is used to build the
    package.
 -  *src/*: Source code for the transport.
 -  *README.md*: README file for the package.


Pull requests
-------------

### AI usage

If you use AI tools (such as GitHub Copilot, Claude, Cursor, etc.) while
contributing, you must disclose this in your pull request description and/or
commit messages.  See *[AI\_POLICY.md][AI_POLICY.md]* for the complete policy.

[AI_POLICY.md]: AI_POLICY.md

### Changelog entries

If your change affects users of a package, add a changelog fragment with Sacho.
Choose a short, topic-based name and the affected package section:

~~~~ bash
sacho add --section @upyo/smtp smtp-size-limit
~~~~

Edit the file printed by the command.  It must contain one top-level unordered
list describing the user-visible result, not the implementation or commit
history.  Start each entry with a past-tense verb such as “Added” or “Fixed,”
and use `[[#123]]` to reference an issue or pull request.  Keep updating the
same fragment as the change evolves.

Do not edit the unreleased part of *CHANGES.md* directly.  Sacho assembles it
from the fragments under *changes.d/*.  Before committing, run:

~~~~ bash
sacho fmt
sacho preview
sacho check
~~~~

Changes with no user-visible effect, such as internal refactors or test-only
changes, do not need a fragment.

### Verification

Before submitting a pull request, please make sure you have done the following:

 -  Run `mise run check:all` and `sacho check` to validate the change.
 -  Run `mise run test:all` to test all supported runtimes.
 -  Add tests for any new features or bug fixes.
 -  Update the documentation if necessary, then run `mise run docs:build`.
 -  Add or update a Sacho fragment if your changes affect users of a package.

We appreciate your contributions and will review your pull request as soon as
possible. Thank you for helping us make Upyo better!
