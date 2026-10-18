Development tooling
===================

Run development commands through mise.  The version checker and its tests use
[Node.js 24's native TypeScript support][Node TypeScript support] and Node
built-ins.  Node executes the scripts without reading a TypeScript
configuration; type checking is a separate task.

[Node TypeScript support]: https://nodejs.org/docs/latest-v24.x/api/typescript.html


Type checking
-------------

`mise run check:types` runs TypeScript 6.0.3 from the root, matching the
compiler embedded in Deno 2.9.5.  A named `checker` catalog keeps this separate
from the existing TypeScript 5.8.3 compiler used by tsdown and Twoslash.
tsdown 0.12.9 requires TypeScript 5, so the build and documentation catalog
stays on TypeScript 5. The catalogs in *pnpm-workspace.yaml* are the
authoritative version declarations.

*tsconfig.check.json* covers package source, tests, and maintenance scripts,
with explicit mappings from every Deno workspace export to its source.  It
works before any *dist/* directory exists.  A regression test checks that these
mappings keep up with package exports.  Declaration files from dependencies are
type-checked as well.

*tsconfig.tools.json* checks the build configurations separately.  Only this
check skips declaration files from dependencies: tsdown 0.12.9's declarations
refer to the absent optional `unplugin-unused` peer and an undeclared
`pkg-types` module.  The build configuration source itself remains checked.

Package editor configurations use ordinary npm resolution, so run
`mise run build` before editing code that imports another workspace package.
Their `paths` setting is empty because Bun also applies these mappings at
runtime; this keeps its tests on built npm exports.  tsdown
uses `tsconfig: false`, and the workerd bundle passes an empty `tsconfigRaw`,
to keep editor configuration from changing build behavior.  There is no root
*tsconfig.json* for the documentation build to discover, so documentation
compilation is not affected by the checker configuration.  The scripts have
their own editor configuration.

The root Deno configuration pins its libraries and strict options so
package editor configurations cannot introduce browser globals into the Deno
compatibility check.  Both compiler paths continue checking the same package
source.  A private `Headers` constructor declaration in
*packages/core/src/message.ts* models Fetch's iterable input for the source
checker, including read-only header views, without changing emitted JavaScript
or the public types.

Published package runtime requirements are declared in each *package.json*.
The Node.js 24 requirement applies to development scripts, not to published
library consumers.


Linting
-------

`mise run check:lint` uses the root Oxlint dependency.  See the
[rule mapping](./lint-rules.md) for Deno coverage, deliberate gaps, and
suppression differences.  Tests include intentionally invalid values and
asynchronous stubs; their targeted suppressions are retained.


Formatting ownership
--------------------

`mise run fmt` and `mise run check:fmt` use Oxfmt for the existing code and
JSON scope. The explicit extension list limits Oxfmt to code and JSON. Markdown
stays with Hongdown and mise configuration stays with mise. The *docs/* and
*packages/mime/edge/* exclusions are retained.

Oxfmt preserves quoted property names and existing object wrapping, uses
80 columns and two-space indentation, and leaves import order, package field
order, JSDoc, and embedded languages alone. Its union indentation, conditional
expression wrapping, function parameter commas, and JSON array layout can still
differ from Deno's formatter. Keep mechanical reformatting separate from
behavior changes when reviewing or backporting work.

Scripts that rewrite version fields write ordinary JSON. Run `mise run fmt`
afterwards; `mise run bump-version` already does this. Deno formatting and
linting are replaced by Oxfmt and Oxlint rather than run as additional
compatibility checks. Deno source checking, tests, and JSR publication remain
explicit mise tasks.
