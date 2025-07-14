<!-- deno-fmt-ignore-file -->

AGENTS.md
=========

This file provides guidance to LLM coding agents when working with code in this
repository.


Project overview
----------------

Upyo is a cross-runtime email library for Node.js, Deno, Bun, and edge
functions. It's structured as a monorepo with multiple packages:

**Repository**: https://github.com/dahlia/upyo

 -  **@upyo/core**: Shared types and interfaces for email messages
 -  **@upyo/smtp**: SMTP transport implementation  
 -  **@upyo/mailgun**: Mailgun transport implementation
 -  **docs**: VitePress documentation site


Development commands
--------------------

### Root level commands

**Using Deno (primary):**

 -  `deno task test` — Run tests with environment variables from .env.test
 -  `deno task check` — Run full validation (check versions, type check, lint, format check, dry-run publish)
 -  `deno task check-versions` — Verify package version consistency across workspace
 -  `deno fmt` — Format code (excludes markdown and YAML files)
 -  `deno lint` — Lint TypeScript code
 -  `deno check` — Type check all TypeScript files

**Using pnpm (for npm ecosystem compatibility):**

 -  `pnpm build` — Build all packages for npm distribution
 -  `pnpm run -r build` — Build all packages recursively
 -  `pnpm run --filter '!{docs}' -r build` — Build all packages except docs

### Package level commands

Each package supports multiple runtimes and can be executed with both Deno
tasks and npm scripts:

**Deno tasks (in deno.json):**

 -  `deno task test` — Run tests with Deno
 -  `deno task test:node` — Run tests with Node.js (requires build first)
 -  `deno task test:bun` — Run tests with Bun (requires build first)  
 -  `deno task test-all` — Run tests across all runtimes
 -  `deno task build` or `pnpm build` — Build package for npm distribution

**npm scripts (in package.json):**

 -  `pnpm build` or `npm run build` — Build with tsdown
 -  `pnpm test` — Run Node.js tests with dotenvx for environment loading
 -  `pnpm run test:bun` — Run Bun tests 
 -  `pnpm run test:deno` — Run Deno tests
 -  `pnpm run test-all` — Run tests across all runtimes

**SMTP package specific:**

 -  `pnpm run mailpit:start` — Start Mailpit Docker container for testing
 -  `pnpm run mailpit:stop` — Stop and remove Mailpit container
 -  `pnpm run dev:mailpit` — Run Mailpit in foreground mode

### Documentation

 -  `cd docs && pnpm dev` — Start VitePress dev server
 -  `cd docs && pnpm build` — Build documentation site


Architecture
------------

### Monorepo structure

 -  **Dual workspace setup**: Uses both Deno workspaces (deno.json) and pnpm workspaces (pnpm-workspace.yaml)
 -  **Package management**: pnpm catalog for shared dependency versions
 -  **Cross-runtime builds**: tsdown generates both ESM (.js) and CommonJS (.cjs) outputs with TypeScript declarations

### Dependency management

 -  **Workspace references**: Packages use `workspace:*` for internal dependencies
 -  **Catalog dependencies**: Shared versions defined in pnpm-workspace.yaml catalog
 -  **Environment loading**: dotenvx used for environment variable management in tests

### Core design

 -  **Transport pattern**: Core defines interfaces, transport packages implement specific providers
 -  **Cross-runtime compatibility**: Code works on Deno, Node.js, Bun, and edge functions
 -  **Type-first approach**: Comprehensive TypeScript definitions with dual CJS/ESM exports

### Key components

 -  `Transport` interface: Abstract base for all email transports
 -  `Message` type: Standardized email message format with attachments, HTML/text content
 -  `Receipt` type: Discriminated union for type-safe delivery confirmation (success with messageId or failure with errorMessages)
 -  Address validation and priority handling built into core

### Transport abstraction pattern

The `Transport` interface provides a unified API for all email providers, enabling seamless switching between services without changing application code:

#### Core interface (packages/core/src/transport.ts)

```typescript
export interface Transport {
  send(message: Message, options?: TransportOptions): Promise<Receipt>;
  sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt>;
}
```

#### Key abstraction principles

 -  **Unified API**: All transports implement identical interface regardless of underlying protocol (SMTP, HTTP API)
 -  **Message normalization**: Single `Message` type works across all providers with readonly properties for immutability
 -  **Error standardization**: All failures converted to standardized `Receipt` discriminated union format
 -  **Cancellation support**: Consistent `AbortSignal` support via `TransportOptions` across all implementations
 -  **Bulk operations**: `sendMany()` uses async iteration for memory-efficient batch processing

#### Implementation patterns

 -  **SMTP transport**: Connection pooling, resource management with `AsyncDisposable`, protocol-specific optimizations
 -  **HTTP-based transports** (Mailgun): Stateless HTTP clients, simpler implementation without connection management
 -  **Configuration factories**: `createXConfig()` functions apply provider-specific defaults and validation
 -  **Provider-specific optimization**: Each transport optimizes for its protocol while maintaining API consistency

#### Type safety features

 -  **Discriminated unions**: `Receipt` type ensures compile-time handling of success/failure cases
 -  **Readonly interfaces**: Prevents accidental mutations with comprehensive readonly modifiers
 -  **Generic iteration**: `sendMany()` accepts both sync and async iterables for flexible batch processing

This abstraction allows switching email providers by only changing the transport constructor while maintaining identical usage patterns throughout the application.

### Build system

 -  **tsdown**: Primary build tool that generates npm-compatible packages from Deno code
 -  **Dual exports**: Each package exports both ESM and CommonJS with proper TypeScript declarations
 -  **Pre-publish hooks**: Automatic building before npm publishing via prepack/prepublish scripts

### Testing strategy

 -  **Multi-runtime testing**: Unit tests run on Deno, Node.js, and Bun
 -  **Integration tests**: SMTP uses Docker Compose with Mailpit for local testing
 -  **E2E tests**: External services like Mailgun with environment-based configuration
 -  **Environment isolation**: .env files for test configuration with dotenvx loading


Documentation style guide
--------------------------

### README structure

All package READMEs follow this consistent structure:

1. **Header**: Package name with double underline (`==========`)
2. **Badges**: JSR and npm badges
3. **Description**: Brief description linking to main Upyo project
4. **Features**: Bullet list of key features (when applicable)
5. **TODO**: Outstanding features with checkboxes (when applicable)
6. **Installation**: Multi-runtime installation commands in code blocks
7. **Usage**: Code examples with TypeScript syntax highlighting
8. **Configuration**: Tables for configuration options
9. **Testing**: Testing utilities and examples

### Code examples

 -  Use `~~~~ typescript` for TypeScript code blocks
 -  Include `twoslash` directive for type checking in docs: `~~~~ typescript twoslash`
 -  Provide practical, runnable examples
 -  Show imports at the top of each example
 -  Use realistic example data (example.com domains, meaningful variable names)

### Documentation conventions

 -  **Markdown headers**: Use sentence case, descriptive titles
 -  **Code formatting**: Use backticks for inline code, triple tildes for code blocks
 -  **Links**: Use reference-style links at bottom of documents
 -  **Tables**: Include descriptive headers with type information and defaults
 -  **Installation sections**: Always show all supported package managers (npm, pnpm, yarn, deno, bun)
 -  **File headers**: Use `<!-- deno-fmt-ignore-file -->` to exclude from Deno formatting

### VitePress documentation

 -  **Frontmatter**: Use YAML frontmatter for VitePress configuration
 -  **Code groups**: Use `::: code-group` for multi-language examples
 -  **Callouts**: Use VitePress-style callouts for important notes
 -  **Navigation**: Organize content logically with clear section headers


Working with this codebase
--------------------------

### Development workflow

The project prioritizes cross-runtime compatibility and dual ecosystem support
(Deno/JSR and npm):

 -  Use `deno task` commands for development and validation
 -  Use `pnpm` commands for npm ecosystem compatibility and building
 -  Always run `deno task check` before committing to validate all requirements
 -  Test across all runtimes with `test-all` commands in each package
 -  For SMTP testing, use Mailpit Docker container via provided scripts

### Code quality standards

 -  Follow the established documentation patterns when creating new content
 -  Maintain consistency in code examples and API documentation
 -  Ensure cross-runtime compatibility when making changes
 -  Write comprehensive tests for new features
 -  Use TypeScript strictly — all code should be properly typed

### TypeScript coding conventions

 -  **Interface immutability**: Always use `readonly` modifiers for interface fields unless mutability is explicitly required. This promotes immutability and prevents accidental modifications:

```typescript
// Preferred: All fields are readonly
export interface SendGridConfig {
  readonly apiKey: string;
  readonly timeout?: number;
  readonly retries?: number;
}

// Avoid: Mutable fields (unless intentionally needed)
export interface BadConfig {
  apiKey: string;
  timeout?: number;
  retries?: number;
}
```

 -  **Array immutability**: Use `readonly` arrays (`readonly T[]`) for interface properties that contain arrays:

```typescript
export interface Message {
  readonly recipients: readonly Address[];
  readonly tags: readonly string[];
  readonly attachments: readonly Attachment[];
}
```

 -  **Nested object immutability**: Apply `readonly` to nested object properties consistently:

```typescript
export interface ApiError {
  readonly message: string;
  readonly errors?: readonly {
    readonly message: string;
    readonly field?: string;
    readonly help?: string;
  }[];
}
```

This convention helps prevent runtime mutations, makes code more predictable, and aligns with functional programming principles used throughout the codebase.

### Testing with Deno and `node:test` API

When writing tests using the `node:test` API in Deno, be aware of these limitations and solutions:

#### Limitations

 -  **Missing lifecycle hooks**: `beforeEach`, `afterEach`, `before`, and `after` are not implemented in Deno's Node.js compatibility layer
 -  **Fetch mocking challenges**: `globalThis.fetch` mocking can be unreliable in some test scenarios
 -  **Test isolation**: Global state can leak between tests without proper cleanup

#### Solutions and best practices

 -  **Use `try`/`finally` for cleanup**: Replace `beforeEach`/`afterEach` with explicit setup and cleanup in each test:

```typescript
it("should handle mocked fetch", async () => {
  const originalFetch = globalThis.fetch;
  
  try {
    // Setup mock
    globalThis.fetch = () => Promise.resolve(new Response("mock"));
    
    // Test logic here
    const result = await someFunction();
    assert.equal(result, "expected");
  } finally {
    // Always restore original
    globalThis.fetch = originalFetch;
  }
});
```

 -  **Separate unit and integration tests**: For complex mocking scenarios, prefer unit tests for logic and E2E tests for network calls
 -  **Use AbortController for network test isolation**: Immediately abort requests to prevent actual network calls in unit tests:

```typescript
it("should validate request structure", async () => {
  const controller = new AbortController();
  controller.abort();
  
  try {
    await transport.send(message, { signal: controller.signal });
    assert.fail("Should have thrown AbortError");
  } catch (error) {
    assert.ok(error.name === "AbortError");
  }
});
```

 -  **Test configuration and interfaces**: Focus unit tests on configuration validation, type checking, and error handling rather than network behavior

### Common tasks for agents

 -  **Adding new transport**: Follow the pattern established by existing transports (SMTP, Mailgun)
 -  **Writing tests**: Use the testing utilities provided in each package's test-utils directory
 -  **Updating documentation**: Follow the documentation style guide above
 -  **Bug fixes**: Ensure fixes work across all supported runtimes
 -  **Feature additions**: Maintain backward compatibility and update relevant documentation