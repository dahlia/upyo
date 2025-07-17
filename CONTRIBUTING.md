<!-- deno-fmt-ignore-file -->

Contributing to Upyo
====================

First of all, thank you for considering contributing to Upyo! We welcome any
contributions, from bug reports and documentation improvements to new features
and transport implementations. This document provides some guidelines for
contributing to the project.

If you have any questions, please feel free to open an issue or join our
community discussions.


Getting started
---------------

Upyo is a monorepo that uses [pnpm] for Node.js package management and [Deno]
for runtime and tooling (linting, formatting, testing). To get started,
you'll need to have [Node.js], [pnpm], and [Deno] installed on your system.

 1. **Fork and clone the repository**

    ~~~~ bash
    git clone https://github.com/YOUR_USERNAME/upyo.git
    cd upyo
    ~~~~

 2. **Install dependencies**

    ~~~~ bash
    pnpm install
    ~~~~

    This will install all Node.js dependencies for the entire monorepo.

[Node.js]: https://nodejs.org/
[pnpm]: https://pnpm.io/
[Deno]: https://deno.com/


Development
-----------

The project uses both `pnpm` for Node.js-specific tasks and `deno` for
general development tasks like linting, formatting, and testing.

 -  **`pnpm build`**

    Builds all packages for Node.js environments. You can also build a
    specific package by running `pnpm build` from within the package's
    directory.

 -  **`deno task test`**

    Runs the test suite using Deno. This is the primary way to run tests.

 -  **`pnpm test`**

    Runs the test suite using Node.js. It's important to run this as well to
    ensure cross-runtime compatibility.

 -  **`deno lint`**

    Checks the codebase for linting issues.

 -  **`deno fmt`**

    Formats the entire codebase according to the project's style.

 -  **`deno task check`**

    A convenient shorthand that runs type checking, linting, formatting checks,
    and a dry-run publish to ensure everything is correct. This is a great
    command to run before committing your changes.


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

Before submitting a pull request, please make sure you have done the following:

 -  Run `deno task check` to ensure the code is clean and correct.
 -  Run `deno task test` and `pnpm test` to ensure all tests pass in both
    runtimes.
 -  Add tests for any new features or bug fixes.
 -  Update the documentation if necessary.
 -  Add a changeset to *CHANGES.md* if your changes affect any of
    the public-facing packages.

We appreciate your contributions and will review your pull request as soon as
possible. Thank you for helping us make Upyo better!
