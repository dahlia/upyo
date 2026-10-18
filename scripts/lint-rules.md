Lint rule coverage
==================

This table maps the 87 recommended rules reported by [Deno 2.9.5][deno-rules]
to the explicit [Oxlint 1.88.0][oxlint-rules] configuration.  The default
Oxlint correctness category is disabled so an upgrade does not silently enable
unrelated rules.  Configured rules are errors, warnings fail the gate, and
unused suppressions fail.

Rules with the same name can still differ.  `no-unused-vars` checks all
arguments and caught exceptions and permits underscore-prefixed bindings and
unused object-rest siblings.  `require-await` is syntactic and, like Deno's
rule, exempts async generators.  `no-this-alias` also reports assignment to an
outer binding; the SMTP test's intentional instance capture has a local
suppression.  Oxlint reports case declarations on the declaration itself,
so those suppressions sit above the declaration, rather than the case label.

The source checker uses DOM declarations for the standard fetch, streams, and
Web Crypto APIs.  `window` and `document`, including access through
`globalThis`, are prohibited by lint.  This does not claim browser support.
Deno checking remains a separate compatibility gate.

[deno-rules]: https://docs.deno.com/runtime/reference/cli/lint/
[oxlint-rules]: https://oxc.rs/docs/guide/usage/linter/rules.html


Mapping
-------

| Deno rule                           | Replacement or boundary                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `adjacent-overload-signatures`      | `typescript/adjacent-overload-signatures`                                                |
| `ban-ts-comment`                    | `typescript/ban-ts-comment`                                                              |
| `ban-types`                         | `typescript/ban-types`                                                                   |
| `ban-unknown-rule-code`             | Unknown suppression names fail the unused-directive check.                               |
| `ban-untagged-ignore`               | Gap: unqualified Oxlint disable comments are accepted. Name rules in new suppressions.   |
| `ban-unused-ignore`                 | `options.reportUnusedDisableDirectives: "error"`                                         |
| `constructor-super`                 | `eslint/constructor-super`                                                               |
| `for-direction`                     | `eslint/for-direction`                                                                   |
| `getter-return`                     | `eslint/getter-return`                                                                   |
| `jsx-boolean-value`                 | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-button-has-type`               | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-curly-braces`                  | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-key`                           | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-no-children-prop`              | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-no-comment-text-nodes`         | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-no-duplicate-props`            | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-no-unescaped-entities`         | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-no-useless-fragment`           | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-props-no-spread-multi`         | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `jsx-void-dom-elements-no-children` | Not enabled: this repository has no JSX/TSX. Review coverage if JSX is introduced.       |
| `no-array-constructor`              | `eslint/no-array-constructor`                                                            |
| `no-async-promise-executor`         | `eslint/no-async-promise-executor`                                                       |
| `no-await-in-sync-fn`               | TypeScript syntax checking.                                                              |
| `no-case-declarations`              | `eslint/no-case-declarations`                                                            |
| `no-class-assign`                   | `eslint/no-class-assign`                                                                 |
| `no-compare-neg-zero`               | `eslint/no-compare-neg-zero`                                                             |
| `no-cond-assign`                    | `eslint/no-cond-assign`                                                                  |
| `no-const-assign`                   | `eslint/no-const-assign`                                                                 |
| `no-constant-condition`             | `eslint/no-constant-condition`                                                           |
| `no-control-regex`                  | `eslint/no-control-regex`                                                                |
| `no-debugger`                       | `eslint/no-debugger`                                                                     |
| `no-delete-var`                     | `eslint/no-delete-var`                                                                   |
| `no-deprecated-deno-api`            | Gap: no Deno APIs remain in checked development or package code.                         |
| `no-dupe-args`                      | TypeScript syntax checking.                                                              |
| `no-dupe-class-members`             | `eslint/no-dupe-class-members`                                                           |
| `no-dupe-else-if`                   | `eslint/no-dupe-else-if`                                                                 |
| `no-dupe-keys`                      | `eslint/no-dupe-keys`                                                                    |
| `no-duplicate-case`                 | `eslint/no-duplicate-case`                                                               |
| `no-empty`                          | `eslint/no-empty`                                                                        |
| `no-empty-character-class`          | `eslint/no-empty-character-class`                                                        |
| `no-empty-enum`                     | Gap: Oxlint has no equivalent; TypeScript accepts empty enums.                           |
| `no-empty-interface`                | `typescript/no-empty-interface`                                                          |
| `no-empty-pattern`                  | `eslint/no-empty-pattern`                                                                |
| `no-ex-assign`                      | `eslint/no-ex-assign`                                                                    |
| `no-explicit-any`                   | `typescript/no-explicit-any`                                                             |
| `no-extra-boolean-cast`             | `eslint/no-extra-boolean-cast`                                                           |
| `no-extra-non-null-assertion`       | `typescript/no-extra-non-null-assertion`                                                 |
| `no-fallthrough`                    | `eslint/no-fallthrough`                                                                  |
| `no-func-assign`                    | `eslint/no-func-assign`                                                                  |
| `no-global-assign`                  | `eslint/no-global-assign`                                                                |
| `no-import-assertions`              | TypeScript rejects obsolete import assertions.                                           |
| `no-import-assign`                  | `eslint/no-import-assign`                                                                |
| `no-inner-declarations`             | `eslint/no-inner-declarations`                                                           |
| `no-invalid-regexp`                 | `eslint/no-invalid-regexp`                                                               |
| `no-invalid-triple-slash-reference` | `typescript/triple-slash-reference` and TypeScript diagnostics (not identical rules).    |
| `no-irregular-whitespace`           | `eslint/no-irregular-whitespace`                                                         |
| `no-misused-new`                    | `typescript/no-misused-new`                                                              |
| `no-namespace`                      | `typescript/no-namespace`                                                                |
| `no-new-symbol`                     | `eslint/no-new-native-nonconstructor`                                                    |
| `no-obj-calls`                      | `eslint/no-obj-calls`                                                                    |
| `no-octal`                          | Strict ES module syntax checking.                                                        |
| `no-prototype-builtins`             | `eslint/no-prototype-builtins`                                                           |
| `no-redeclare`                      | `eslint/no-redeclare`                                                                    |
| `no-regex-spaces`                   | `eslint/no-regex-spaces`                                                                 |
| `no-self-assign`                    | `eslint/no-self-assign`                                                                  |
| `no-setter-return`                  | `eslint/no-setter-return`                                                                |
| `no-shadow-restricted-names`        | `eslint/no-shadow-restricted-names`                                                      |
| `no-sloppy-imports`                 | NodeNext checks relative import extensions; Deno checks retain Deno-specific resolution. |
| `no-this-alias`                     | `typescript/no-this-alias`                                                               |
| `no-this-before-super`              | `eslint/no-this-before-super`                                                            |
| `no-unreachable`                    | `eslint/no-unreachable`                                                                  |
| `no-unsafe-finally`                 | `eslint/no-unsafe-finally`                                                               |
| `no-unsafe-negation`                | `eslint/no-unsafe-negation`                                                              |
| `no-unused-labels`                  | `eslint/no-unused-labels`                                                                |
| `no-unused-vars`                    | `eslint/no-unused-vars`                                                                  |
| `no-unversioned-import`             | Gap in ordinary lint; JSR validation and the Deno lock retain registry checks.           |
| `no-var`                            | `eslint/no-var`                                                                          |
| `no-window`                         | `eslint/no-restricted-globals` and `eslint/no-restricted-properties`                     |
| `no-window-prefix`                  | `eslint/no-restricted-globals` and `eslint/no-restricted-properties`                     |
| `no-with`                           | `eslint/no-with`                                                                         |
| `prefer-as-const`                   | `typescript/prefer-as-const`                                                             |
| `prefer-const`                      | `eslint/prefer-const`                                                                    |
| `prefer-namespace-keyword`          | `typescript/prefer-namespace-keyword`                                                    |
| `require-await`                     | `eslint/require-await`                                                                   |
| `require-yield`                     | `eslint/require-yield`                                                                   |
| `use-isnan`                         | `eslint/use-isnan`                                                                       |
| `valid-typeof`                      | `eslint/valid-typeof`                                                                    |

JSR's `no-slow-types` and `verbatim-module-syntax` checks are outside Deno's
recommended set.  JSR dry-run validation retains the former.  The source checker
enables `verbatimModuleSyntax`, which covers the latter.  Node-only tooling
dependencies are declared in the root npm manifest; they are not added to the
Deno import map because no Deno code imports them.
