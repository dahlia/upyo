<!-- deno-fmt-ignore-file -->

Guidance for LLM-based code agents
==================================

This file provides guidance to LLM-based code agents (e.g., Claude Code,
OpenCode) when working with code in this repository.


Project overview
----------------

Upyo is a cross-runtime email library for Node.js, Deno, Bun, and edge
functions.  It's structured as a monorepo with multiple packages:

*Repository*: <https://github.com/dahlia/upyo>

 -  *@upyo/core*: Shared types and interfaces for email messages
 -  *@upyo/smtp*: SMTP transport implementation
 -  *@upyo/mailgun*: Mailgun transport implementation
 -  *@upyo/sendgrid*: SendGrid transport implementation
 -  *@upyo/ses*: Amazon SES transport implementation
 -  *@upyo/mock*: Mock transport for testing
 -  *@upyo/opentelemetry*: OpenTelemetry observability transport
 -  *docs*: VitePress documentation site


Development commands
--------------------

This is a polyglot monorepo supporting Deno, Node.js, and Bun.

### Package manager

This project uses Deno as the primary development tool and pnpm for
npm-related tasks (building for npm publishing).

> [!IMPORTANT]
> Do *not* use npm or Yarn as package managers in this project.  Always use
> Deno tasks (`deno task ...`) for development workflows and pnpm
> (`pnpm run ...`) only for npm build tasks.

### Root level commands

*Using Deno (primary):*

 -  `deno task test` — Run tests with environment variables from *.env.test*
 -  `deno task check` — Run full validation (check versions, type check, lint,
    format check, dry-run publish)
 -  `deno task check-versions` — Verify package version consistency across
    workspace
 -  `deno fmt` — Format code (excludes markdown and YAML files)
 -  `deno lint` — Lint TypeScript code
 -  `deno check` — Type check all TypeScript files

*Using pnpm (for npm ecosystem compatibility):*

 -  `pnpm build` — Build all packages for npm distribution
 -  `pnpm run -r build` — Build all packages recursively
 -  `pnpm run --filter '!{docs}' -r build` — Build all packages except docs

### Package level commands

Each package supports multiple runtimes and can be executed with both Deno
tasks and npm scripts:

*Deno tasks (in deno.json):*

 -  `deno task test` — Run tests with Deno
 -  `deno task test:node` — Run tests with Node.js (requires build first)
 -  `deno task test:bun` — Run tests with Bun (requires build first)
 -  `deno task test-all` — Run tests across all runtimes
 -  `deno task build` or `pnpm build` — Build package for npm distribution

*npm scripts (in package.json):*

 -  `pnpm build` or `npm run build` — Build with tsdown
 -  `pnpm test` — Run Node.js tests with dotenvx for environment loading
 -  `pnpm run test:bun` — Run Bun tests
 -  `pnpm run test:deno` — Run Deno tests
 -  `pnpm run test-all` — Run tests across all runtimes

*SMTP package specific:*

 -  `pnpm run mailpit:start` — Start Mailpit Docker container for testing
 -  `pnpm run mailpit:stop` — Stop and remove Mailpit container
 -  `pnpm run dev:mailpit` — Run Mailpit in foreground mode

### Documentation

 -  `cd docs && pnpm dev` — Start VitePress dev server
 -  `cd docs && pnpm build` — Build documentation site

### Adding dependencies

When adding new dependencies, always check for the latest version:

 -  *npm packages*: Use `npm view <package> version` to find the latest version
 -  *JSR packages*: Use the [JSR API] to find the latest version

Always prefer the latest stable version unless there is a specific reason
to use an older version.

> [!IMPORTANT]
> Because this project supports both Deno and Node.js/Bun, dependencies must
> be added to *both* configuration files:
>
>  -  *deno.json*: Add to the `imports` field (for Deno)
>  -  *package.json*: Add to `dependencies` or `devDependencies` (for Node.js/Bun)
>
> For workspace packages, use the pnpm catalog (*pnpm-workspace.yaml*) to manage
> versions centrally.  In *package.json*, reference catalog versions with
> `"catalog:"` instead of hardcoding version numbers.
>
> Forgetting to add a dependency to *package.json* will cause Node.js and Bun
> tests to fail with `ERR_MODULE_NOT_FOUND`, even if Deno tests pass.

[JSR API]: https://jsr.io/docs/api

### Temporary scripts

When creating temporary test scripts, save them in the *tmp/* directory
at the project root (not the system */tmp* directory).  This directory is
already in *.gitignore*.

Using the project-local *tmp/* directory allows you to import `@upyo/*`
packages with relative imports, whereas using the system */tmp* would require
absolute paths since it is outside the workspace.


Architecture
------------

### Monorepo structure

 -  *Dual workspace setup*: Uses both Deno workspaces (*deno.json*) and pnpm
    workspaces (*pnpm-workspace.yaml*)
 -  *Package management*: pnpm catalog for shared dependency versions
 -  *Cross-runtime builds*: tsdown generates both ESM (*.js*) and CommonJS
    (*.cjs*) outputs with TypeScript declarations

### Dependency management

 -  *Workspace references*: Packages use `workspace:*` for internal dependencies
 -  *Catalog dependencies*: Shared versions defined in *pnpm-workspace.yaml*
    catalog
 -  *Environment loading*: dotenvx used for environment variable management
    in tests

### Dual publishing

Each package is published to both JSR (Deno) and npm (Node.js/Bun):

 -  JSR uses *deno.json* with TypeScript source directly
 -  npm uses *package.json* with tsdown-built *dist/* output (ESM + CJS + .d.ts)

When adding subpath exports to a package, update the following files:

 -  *deno.json*: Add the subpath to the `exports` field
 -  *package.json*: Add the subpath to the `exports` field
 -  *tsdown.config.ts*: Add the entry point to the build configuration

### Adding new packages

When adding a new package to the monorepo, update the following files:

 -  *README.md* (root): Add the package to the Packages table
 -  *AGENTS.md*: Add the package to the Package structure list (if applicable)
 -  *docs/.vitepress/config.mts*: Add API reference link to the navigation
 -  *docs/package.json*: Add `"@upyo/<name>": "workspace:"` to `devDependencies`
    (required for Twoslash type checking in documentation)

### Core design

 -  *Transport pattern*: Core defines interfaces, transport packages implement
    specific providers
 -  *Cross-runtime compatibility*: Code works on Deno, Node.js, Bun, and edge
    functions
 -  *Type-first approach*: Comprehensive TypeScript definitions with dual
    CJS/ESM exports

### Key components

 -  `Transport` interface: Abstract base for all email transports
 -  `Message` type: Standardized email message format with attachments,
    HTML/text content
 -  `Receipt` type: Discriminated union for type-safe delivery confirmation
    (success with messageId or failure with errorMessages)
 -  Address validation and priority handling built into core

### Transport abstraction pattern

The `Transport` interface provides a unified API for all email providers,
enabling seamless switching between services without changing application code:

#### Core interface (*packages/core/src/transport.ts*)

~~~~ typescript
export interface Transport {
  send(message: Message, options?: TransportOptions): Promise<Receipt>;
  sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt>;
}
~~~~

#### Key abstraction principles

 -  *Unified API*: All transports implement identical interface regardless of
    underlying protocol (SMTP, HTTP API)
 -  *Message normalization*: Single `Message` type works across all providers
    with readonly properties for immutability
 -  *Error standardization*: All failures converted to standardized `Receipt`
    discriminated union format
 -  *Cancellation support*: Consistent `AbortSignal` support via
    `TransportOptions` across all implementations
 -  *Bulk operations*: `sendMany()` uses async iteration for memory-efficient
    batch processing

#### Implementation patterns

 -  *SMTP transport*: Connection pooling, resource management with
    `AsyncDisposable`, protocol-specific optimizations
 -  *HTTP-based transports* (Mailgun, SendGrid, SES): Stateless HTTP clients,
    simpler implementation without connection management
 -  *Mock transport*: In-memory testing implementation with comprehensive
    inspection capabilities
 -  *OpenTelemetry transport*: Decorator pattern for adding observability to
    any transport
 -  *Configuration factories*: `createXConfig()` functions apply
    provider-specific defaults and validation
 -  *Provider-specific optimization*: Each transport optimizes for its protocol
    while maintaining API consistency

#### Type safety features

 -  *Discriminated unions*: `Receipt` type ensures compile-time handling of
    success/failure cases
 -  *Readonly interfaces*: Prevents accidental mutations with comprehensive
    readonly modifiers
 -  *Generic iteration*: `sendMany()` accepts both sync and async iterables
    for flexible batch processing

This abstraction allows switching email providers by only changing the
transport constructor while maintaining identical usage patterns throughout
the application.

### Available transports

#### Core transports

 -  *@upyo/smtp*: Full-featured SMTP client with connection pooling, TLS
    support, and authentication
 -  *@upyo/mailgun*: Mailgun HTTP API transport with support for US/EU regions
    and batch operations
 -  *@upyo/sendgrid*: SendGrid HTTP API transport with template support and
    webhook handling
 -  *@upyo/ses*: Amazon SES HTTP API transport with AWS authentication and
    regional endpoints

#### Utility transports

 -  *@upyo/mock*: Testing transport that captures sent messages for inspection
    without external dependencies
 -  *@upyo/opentelemetry*: Decorator transport that adds OpenTelemetry
    observability to any base transport

#### Transport characteristics

 -  *SMTP*: Direct protocol implementation, works with any SMTP server,
    supports connection reuse
 -  *HTTP-based* (Mailgun, SendGrid, SES): Stateless, simpler configuration,
    provider-specific features
 -  *Mock*: In-memory storage, failure simulation, comprehensive testing
    utilities
 -  *OpenTelemetry*: Transparent wrapper, metrics collection, distributed
    tracing, error classification

### Build system

 -  *tsdown*: Primary build tool that generates npm-compatible packages from
    Deno code
 -  *Dual exports*: Each package exports both ESM and CommonJS with proper
    TypeScript declarations
 -  *Pre-publish hooks*: Automatic building before npm publishing via
    prepack/prepublish scripts

### Testing strategy

 -  *Multi-runtime testing*: Unit tests run on Deno, Node.js, and Bun
 -  *Integration tests*: SMTP uses Docker Compose with Mailpit for local
    testing
 -  *E2E tests*: External services like Mailgun, SendGrid, and SES with
    environment-based configuration
 -  *Mock testing*: Comprehensive mock transport for testing email workflows
    without external dependencies
 -  *Observability testing*: OpenTelemetry transport includes integration tests
    with real OpenTelemetry SDK
 -  *Environment isolation*: *.env* files for test configuration with dotenvx
    loading


Development practices
---------------------

### Test-driven development

This project follows test-driven development (TDD) practices:

 -  *Write tests first*: Before implementing new functionality, write tests
    that describe the expected behavior.  Confirm that the tests fail before
    proceeding with the implementation.
 -  *Regression tests for bugs*: When fixing bugs, first write a regression
    test that reproduces the bug.  Confirm that the test fails, then fix the
    bug and verify the test passes.

### Commit messages

 -  Do not use Conventional Commits (no `fix:`, `feat:`, etc. prefixes).
    Keep the first line under 50 characters when possible.
 -  Focus on *why* the change was made, not just *what* changed.
 -  When referencing issues or PRs, use permalink URLs instead of just
    numbers (e.g., `#123`).  This preserves context if the repository
    is moved later.
 -  When listing items after a colon, add a blank line after the colon:

    ~~~~
    This commit includes the following changes:

    - Added foo
    - Fixed bar
    ~~~~

 -  When using LLMs or coding agents, include credit via `Co-Authored-By:`.
    Include a permalink to the agent session if available.

### Before committing

 -  *Run all checks*: Before committing any changes, run `deno task check` to
    ensure all checks pass (type check, lint, format, dry-run publish).
 -  *Test across runtimes*: For significant changes, run tests across Deno,
    Node.js, and Bun runtimes using `test-all` commands.

### Changelog (*CHANGES.md*)

This repository uses *CHANGES.md* as a human-readable changelog.  Follow
these conventions:

 -  *Structure*: Keep entries in reverse chronological order (newest version at
    the top).

 -  *Version sections*: Each release is a top-level section:

    ~~~~
    Version 0.1.0
    -------------
    ~~~~

 -  *Unreleased version*: The next version should start with:

    ~~~~
    To be released.
    ~~~~

 -  *Released versions*: Use a release-date line right after the version header:

    ~~~~
    Released on December 30, 2025.
    ~~~~

    If you need to add brief context (e.g., initial release), keep it on the
    same sentence:

    ~~~~
    Released on August 21, 2025.  Initial release.
    ~~~~

 -  *Package grouping*: Within a version, group entries by package (or major
    subsystem) using `###` headings (e.g., `### @upyo/core`).

 -  *Bullets and wrapping*: Use ` -  ` list items, wrap around ~80 columns, and
    indent continuation lines by 4 spaces so they align with the bullet text.

 -  *Write useful change notes*: Prefer concrete, user-facing descriptions.
    Include what changed, why it changed, and what users should do differently
    (especially for breaking changes, deprecations, and security fixes).

 -  *Multi-paragraph items*: For longer explanations, keep paragraphs inside the
    same bullet item by indenting them by 4 spaces and separating paragraphs
    with a blank line (also indented).

 -  *Code blocks in bullets*: If a bullet includes code, indent the entire code
    fence by 4 spaces so it remains part of that list item.  Use `~~~~` fences
    and specify a language (e.g., `~~~~ typescript`).

 -  *Nested lists*: If you need sub-items (e.g., a list of added exports), use a
    nested list inside the parent bullet, indented by 4 spaces.

 -  *Issue and PR references*: Use `[[#123]]` markers in the text and add
    reference links at the end of the relevant package subsection (before the
    next `###` heading or the next version).

    When listing multiple issues/PRs, list them like `[[#123], [#124]]`.

    When the reference is for a PR authored by an external contributor, append
    `by <NAME>` after the last reference marker (e.g., `[[#123] by Hong Minhee]`
    or `[[#123], [#124] by Hong Minhee]`).

    ~~~~
    [#123]: https://github.com/dahlia/upyo/issues/123
    [#124]: https://github.com/dahlia/upyo/pull/124
    ~~~~


Code style
----------

### Type safety

 -  All code must be type-safe.  Avoid using the `any` type.
 -  Do not use unsafe type assertions like `as unknown as ...` to bypass
    the type system.
 -  Prefer immutable data structures unless there is a specific reason to
    use mutable ones.  Use `readonly T[]` for array types and add the
    `readonly` modifier to all interface fields.
 -  Use the nullish coalescing operator (`??`) instead of the logical OR
    operator (`||`) for default values.

### Async patterns

 -  All async functions must accept an `AbortSignal` parameter to support
    cancellation.

### API documentation

 -  All exported APIs must have JSDoc comments describing their purpose,
    parameters, and return values.
 -  For APIs added in a specific version, include the `@since` tag with the
    version number:

    ~~~~ typescript
    /**
     * Sends an email message through the transport.
     *
     * @param message The email message to send.
     * @param options Optional transport options including abort signal.
     * @returns A receipt indicating success or failure.
     * @since 0.2.0
     */
    send(message: Message, options?: TransportOptions): Promise<Receipt>;
    ~~~~

### Testing

 -  Use the `node:test` and `node:assert/strict` APIs to ensure tests run
    across all runtimes (Node.js, Deno, and Bun).
 -  Avoid the `assert.equal(..., true)` or `assert.equal(..., false)` patterns.
    Use `assert.ok(...)` and `assert.ok(!...)` instead.

### Error messages

 -  Prefer specific error types over generic `Error`.  Use built-in types
    like `TypeError`, `RangeError`, or `SyntaxError` when appropriate.
    If none of the built-in types fit, define and export a custom error class:

    ~~~~ typescript
    // Good: specific error type
    throw new TypeError("Expected a string.");
    throw new RangeError("Port number out of range.");

    // Good: custom error class (must be exported)
    export class SmtpError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "SmtpError";
      }
    }

    // Avoid: generic Error when a more specific type applies
    throw new Error("Expected a string.");
    ~~~~

 -  End error messages with a period:

    ~~~~ typescript
    throw new Error("Connection failed.");
    throw new Error("Invalid email address format.");
    ~~~~

 -  When the message ends with a value after a colon, the period can be
    omitted:

    ~~~~ typescript
    throw new Error(`Failed to connect to host: ${host}`);
    throw new Error(`Unsupported auth method: ${method}`);
    ~~~~

 -  Functions or methods that throw exceptions must include the `@throws` tag
    in their JSDoc comments:

    ~~~~ typescript
    /**
     * Parses an email address string.
     *
     * @param address The email address string to parse.
     * @returns The parsed address object.
     * @throws {SyntaxError} If the address format is invalid.
     */
    export function parseAddress(address: string): Address {
      // ...
    }
    ~~~~


Writing style
-------------

When writing documentation in English:

 -  Documentation under *docs/* is not mechanically formatted.
    `deno fmt` intentionally excludes Markdown and the *docs/* directory, so
    follow the rules below manually.
 -  Use sentence case for titles and headings (capitalize only the first word
    and proper nouns), not Title Case.
 -  Use curly quotation marks ("like this") for quotations in English prose.
    Use straight apostrophes (like this: '...') for contractions and possessives.
 -  Use *italics* for emphasis rather than **bold**.  Do not overuse emphasis.
 -  Avoid common LLM writing patterns: overusing em dashes, excessive emphasis,
    compulsive summarizing and categorizing, and rigid textbook-like structure
    at the expense of natural flow.


Markdown style guide
--------------------

When creating or editing Markdown documentation files in this project,
follow these style conventions to maintain consistency with existing
documentation:

### Headings

 -  *Setext-style headings*: Use underline-style for the document title
    (with `=`) and sections (with `-`):

    ~~~~
    Document Title
    ==============

    Section Name
    ------------
    ~~~~

 -  *ATX-style headings*: Use only for subsections within a section:

    ~~~~
    ### Subsection Name
    ~~~~

 -  *Heading case*: Use sentence case (capitalize only the first word and
    proper nouns) rather than Title Case:

    ~~~~
    Development commands    ← Correct
    Development Commands    ← Incorrect
    ~~~~

### Text formatting

 -  *Italics* (`*text*`): Use for package names (*@upyo/core*,
    *@upyo/smtp*), emphasis, and to distinguish concepts
 -  *Bold* (`**text**`): Use sparingly for strong emphasis
 -  *Inline code* (`` `code` ``): Use for code spans, function names,
    filenames, and command-line options

### Lists

 -  Use ` -  ` (space-hyphen-two spaces) for unordered list items
 -  Indent nested items with 4 spaces
 -  Align continuation text with the item content:

    ~~~~
     -  *First item*: Description text that continues
        on the next line with proper alignment
     -  *Second item*: Another item
    ~~~~

### Code blocks

 -  Use four tildes (`~~~~`) for code fences instead of backticks
 -  Always specify the language identifier:

    ~~~~~
    ~~~~ typescript
    const example = "Hello, world!";
    ~~~~
    ~~~~~

 -  For shell commands, use `bash`:

    ~~~~~
    ~~~~ bash
    deno test
    ~~~~
    ~~~~~

### Links

 -  Use reference-style links placed at the *end of each section*
    (not at document end)
 -  Format reference links with consistent spacing:

    ~~~~
    See the [Nodemailer] documentation for SMTP reference.

    [Nodemailer]: https://nodemailer.com/
    ~~~~

### GitHub alerts

Use GitHub-style alert blocks for important information:

 -  *Note*: `> [!NOTE]`
 -  *Tip*: `> [!TIP]`
 -  *Important*: `> [!IMPORTANT]`
 -  *Warning*: `> [!WARNING]`
 -  *Caution*: `> [!CAUTION]`

Continue alert content on subsequent lines with `>`:

~~~~
> [!CAUTION]
> This feature is experimental and may change in future versions.
~~~~

### Tables

Use pipe tables with proper alignment markers:

~~~~
| Package      | Description                  |
| ------------ | ---------------------------- |
| @upyo/core   | Shared types and common code |
~~~~

### Spacing and line length

 -  Wrap lines at approximately 80 characters for readability
 -  Use one blank line between sections and major elements
 -  Use two blank lines before Setext-style section headings
 -  Place one blank line before and after code blocks
 -  End sections with reference links (if any) followed by a blank line


VitePress documentation
-----------------------

The *docs/* directory contains VitePress documentation with additional features
beyond standard Markdown.

### Twoslash code blocks

Use the `twoslash` modifier to enable TypeScript type checking and hover
information in code blocks:

~~~~~
~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
});
~~~~
~~~~~

### Fixture variables

When code examples need variables that shouldn't be shown to readers,
declare them *before* the `// ---cut-before---` directive.  Content before
this directive is compiled but hidden from display:

~~~~~
~~~~ typescript twoslash
const emailContent: string = "";
// ---cut-before---
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
});

await transport.send({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Hello",
  text: emailContent,
});
~~~~
~~~~~

The reader sees only the code after `---cut-before---`, but TypeScript
checks the entire block including the hidden fixture.

For functions that need to exist but shouldn't be shown, use `declare`:

~~~~~
~~~~ typescript twoslash
declare function getEmailTemplate(): string;
// ---cut-before---
import { SmtpTransport } from "@upyo/smtp";

const template = getEmailTemplate();
~~~~
~~~~~

### Definition lists

VitePress supports definition lists for documenting terms, options,
or properties:

~~~~
`host`
:   The SMTP server hostname

`port`
:   The SMTP server port number

`secure`
:   Whether to use TLS from the start
~~~~

This renders as a formatted definition list with the term on one line
and the description indented below.

### Code groups

Use code groups to show the same content for different package managers
or environments:

~~~~
::: code-group

~~~~ bash [Deno]
deno add jsr:@upyo/smtp
~~~~

~~~~ bash [npm]
npm add @upyo/smtp
~~~~

~~~~ bash [pnpm]
pnpm add @upyo/smtp
~~~~

:::
~~~~

### Links

 -  *Internal links*: When linking to other VitePress documents within
    the *docs/* directory, use inline link syntax (e.g.,
    `[text](./path/to/file.md)`) instead of reference-style links.
 -  *Relative paths*: Always use relative paths for internal links.
 -  *File extensions*: Include the `.md` extension in internal link paths.

### Building documentation

~~~~ bash
cd docs
pnpm build    # Build for production (runs Twoslash type checking)
pnpm dev      # Start development server
~~~~

Always run `pnpm build` before committing to catch Twoslash type errors.


Common tasks for agents
-----------------------

 -  *Adding new transport*: Follow the pattern established by existing
    transports (SMTP, Mailgun, SendGrid, SES)
 -  *Writing tests*: Use the testing utilities provided in each package's
    test-utils directory
 -  *Updating documentation*: Follow the documentation style guide above
 -  *Bug fixes*: Ensure fixes work across all supported runtimes
 -  *Feature additions*: Maintain backward compatibility and update relevant
    documentation
 -  *Adding observability*: Use OpenTelemetry transport as decorator for any
    transport
 -  *Testing workflows*: Use mock transport for comprehensive testing without
    external dependencies
