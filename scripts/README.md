Development tooling
===================

Run development commands through mise.  The version checker and its tests use
[Node 24's native TypeScript support][Node TypeScript support] and Node
built-ins.  Node executes the scripts without reading a TypeScript
configuration; type checking is a separate task.

[Node TypeScript support]: https://nodejs.org/docs/latest-v24.x/api/typescript.html


Type checking
-------------

`mise run check:types` runs TypeScript 6.0.3 from the root, matching the
compiler embedded in Deno 2.9.5.  A named `checker` catalog keeps this separate
from the existing TypeScript 5.8.3 compiler used by tsdown and Twoslash.
tsdown 0.12.9 requires TypeScript 5, so the build and documentation catalog
stays unchanged.

*tsconfig.check.json* covers package source, tests, and maintenance scripts,
with explicit mappings from every Deno workspace export to its source.  It
works before any *dist/* directory exists.  A regression test checks that these
mappings keep up with package exports.  Dependency declarations are checked.

*tsconfig.tools.json* checks the build configurations separately.  Only this
check skips dependency declaration checking: tsdown 0.12.9's declarations refer
to the absent optional `unplugin-unused` peer and an undeclared `pkg-types`
module.  The build configuration source itself remains checked.

Package editor configurations use ordinary npm resolution, so run
`mise run build` before editing code that imports another workspace package.
Their `paths` setting is empty to keep Bun tests on built npm exports.  tsdown
uses `tsconfig: false`, and the workerd bundle passes an empty `tsconfigRaw`,
to keep editor configuration from changing build behavior.  There is no root
*tsconfig.json* for the documentation build to discover, so its compilation is
unchanged.  The scripts have their own editor configuration.

The root Deno configuration pins its existing libraries and strict options so
package editor configurations cannot introduce browser globals into the Deno
compatibility check.  Both compiler paths continue checking the same package
source.  A private `Headers` constructor declaration models Fetch's iterable
input, including read-only header views, without changing emitted JavaScript
or the public types.

The package runtime requirements in *package.json* are unchanged.  The Node 24
requirement applies to development scripts, not to published library consumers.


Linting
-------

`mise run check:lint` uses the root Oxlint dependency.  See the
[rule mapping](./lint-rules.md) for Deno coverage, deliberate gaps, and
suppression differences.  Tests include intentionally invalid values and
asynchronous stubs; their targeted suppressions are retained.
