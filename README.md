# to-md

> Fetch any web page and print its main content as clean, LLM-friendly Markdown.

```sh
to-md https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
```

```
# Introduction to Node.js
> Source: https://nodejs.org/en/learn/getting-started/introduction-to-nodejs

Node.js is an open-source and cross-platform JavaScript runtime environment...

## How to run Node.js scripts
...
```

`to-md` is **100% rule-based — no AI, no model calls, no external APIs**. It fetches
a page, strips navigation, ads and boilerplate with a Readability-style heuristic
extractor, then converts the remaining HTML to Markdown with a real HTML→MD
converter (`<p>` → text, `<strong>` → `**`, `<h1>` → `#`, `<table>` → GFM table, …).

## Why

LLMs love Markdown but hate web pages. Most articles ship a mountain of nav bars,
cookie banners, "related posts", share widgets and inline scripts before the actual
content. `to-md` collapses all of that into a single, token-efficient Markdown
document you can paste into any prompt:

```sh
to-md https://example.com/blog/... | pbcopy            # macOS
to-md https://example.com/blog/... | clip              # Windows
to-md https://example.com/blog/... > article.md
```

## Install

```sh
npm install -g @retroz/to-md   # CLI
npm install @retroz/to-md      # or as a library
```

The binary stays `to-md`. Requires Node.js ≥ 18.17.

## CLI usage

```sh
to-md [options] <url>
```

| Option | Description |
| --- | --- |
| `-s, --selector <css>` | Extract only the element matching this CSS selector instead of the auto-detected main content. |
| `-r, --raw` | Convert the whole page body instead of the auto-detected main content. |
| `-o, --output <file>` | Write Markdown to a file instead of stdout. |
| `-t, --title <title>` | Override the page title in the header. |
| `--no-header` | Omit the `# Title` / `> Source:` header. |
| `--max-chars <n>` | Truncate output to approximately `n` characters (cuts at paragraph boundaries). |
| `--max-tokens <n>` | Truncate output to approximately `n` tokens (~4 chars each). |
| `--timeout <ms>` | Request timeout (default: `30000`). |
| `--ua <string>` | Custom User-Agent. |
| `-q, --quiet` | Suppress warnings on stderr. |
| `-V, --version` | Print the version. |
| `-h, --help` | Show help. |

### Examples

```sh
# Just the article, straight to the terminal
to-md https://en.wikipedia.org/wiki/Markdown

# Keep only a section, capped to fit a context window
to-md --selector ".mw-parser-output" --max-tokens 2000 https://en.wikipedia.org/wiki/Markdown

# Save to a file for later
to-md -o article.md https://example.com/blog/intro-to-kubernetes

# Minimal output, no metadata
to-md --no-header https://example.com/docs/quickstart
```

## Library usage

```ts
import { toMarkdown } from "@retroz/to-md";

const result = await toMarkdown("https://example.com/article", {
  maxTokens: 4000,
});

console.log(result.markdown);
console.log(result.title);   // page title
console.log(result.charCount, result.tokenEstimate);
```

`toMarkdown(url, options?)` returns a `ToMdResult`:

```ts
interface ToMdResult {
  title: string;          // page title (og:title > <title> > first h1)
  markdown: string;       // final Markdown, header included
  sourceUrl: string;      // final URL after redirects
  charCount: number;      // markdown.length
  tokenEstimate: number;  // Math.ceil(markdown.length / 4)
  truncated: boolean;     // true if a max-chars/max-tokens limit kicked in
}
```

Lower-level building blocks are exported too: `fetchDocument`, `extractContent`,
`htmlToMarkdown`, and `ToMdError`.

## How it works

1. **Fetch** — the page is downloaded with a sensible browser-like User-Agent,
   following redirects, with a configurable timeout and a 5 MB size cap.
   Character encoding is detected from the `Content-Type` header or a `<meta charset>` tag.
2. **Extract** — invisible elements (`script`, `style`, `svg`, hidden blocks…) and
   boilerplate (`nav`, `header`, `footer`, `aside`) are removed. Every candidate
   container is scored on paragraph density, link density, and class/id hints
   (`article`, `content`, `main`, … boost; `comment`, `sidebar`, `footer`, … penalize).
   The highest-scoring container wins; if nothing looks readable, the command errors out.
   Pure-link paragraphs ("Next / Previous / Up…") and "related posts" link farms are dropped,
   and all relative URLs are resolved to absolute ones.
3. **Convert** — the surviving HTML is converted to Markdown with
   [Turndown](https://github.com/mixmark-io/turndown) + GFM tables/strikethrough,
   producing ATX headings, fenced code blocks, and `**bold**`/`*italic*`.
4. **Print** — a compact `# Title` + `> Source: URL` header is prepended, and the
   result is written to stdout (or a file) with optional paragraph-aware truncation.

Everything is deterministic and offline once the page is fetched — no AI, no API keys.

## Limitations

- JavaScript-rendered pages (SPAs) are not executed; if the content is only present
  after JS runs, you'll get whatever is in the static HTML.
- Content extraction is heuristic — some pages will include a stray element, and a
  few will need `--selector` or `--raw`.
- Pages that block non-browser User-Agents may reject the request (use `--ua`).

## Development

```sh
npm install
npm run dev -- <url>      # run the CLI in watch mode
npm run check             # typecheck + lint + test + build
```

## License

MIT
