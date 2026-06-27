/**
 * A tiny, dependency-free syntax highlighter for the short, curated TypeScript
 * snippets shown on the landing page.  It is deliberately not a general-purpose
 * highlighter: it tokenizes comments, strings, numbers, and identifiers well
 * enough for hand-picked examples, and emits markup styled by the `tok-*`
 * classes in landing.css.  Real documentation code blocks keep using Shiki.
 */

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "await",
  "async",
  "function",
  "return",
  "new",
  "if",
  "else",
  "for",
  "of",
  "in",
  "true",
  "false",
  "null",
  "undefined",
  "type",
  "interface",
  "as",
  "void",
  "class",
  "extends",
  "implements",
  "this",
  "typeof",
  "yield",
]);

const TOKEN_RE =
  /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"?)|('(?:\\.|[^'\\])*'?)|(`(?:\\.|[^`\\])*`?)|(\b\d[\d_.eE]*\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\s])/y;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Highlights a TypeScript snippet into HTML using the landing `tok-*` classes.
 *
 * @param code The source code to highlight.
 * @returns An HTML string safe to inject as the contents of a `<code>` element.
 */
export function highlightTs(code: string): string {
  let out = "";
  let lastSignificant = "";
  TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(code)) !== null) {
    const [full, lineComment, blockComment, dq, sq, tpl, num, ident, ws] =
      match;

    if (lineComment != null || blockComment != null) {
      out += `<span class="tok-comment">${escapeHtml(full)}</span>`;
    } else if (dq != null || sq != null || tpl != null) {
      out += `<span class="tok-string">${escapeHtml(full)}</span>`;
      lastSignificant = full.at(-1) ?? "";
    } else if (num != null) {
      out += `<span class="tok-num">${escapeHtml(full)}</span>`;
      lastSignificant = full.at(-1) ?? "";
    } else if (ident != null) {
      const nextChar = code[TOKEN_RE.lastIndex] ?? "";
      let cls: string | null = null;
      if (KEYWORDS.has(ident)) cls = "tok-keyword";
      else if (/^[A-Z]/.test(ident)) cls = "tok-type";
      else if (nextChar === "(") cls = "tok-func";
      else if (lastSignificant === ".") cls = "tok-prop";

      out += cls == null
        ? escapeHtml(ident)
        : `<span class="${cls}">${escapeHtml(ident)}</span>`;
      lastSignificant = ident.at(-1) ?? "";
    } else if (ws != null) {
      out += full;
    } else {
      out += escapeHtml(full);
      lastSignificant = full;
    }

    // Guard against zero-width matches stalling the loop.
    if (match.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++;
  }

  return out;
}
