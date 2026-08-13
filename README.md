# to-md

> Fetch any web page and print its main content as clean, LLM-friendly Markdown.

[![npm version](https://img.shields.io/npm/v/@retroz/to-md)](https://www.npmjs.com/package/@retroz/to-md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/RetrozDev/to-md/actions/workflows/ci.yml/badge.svg)](https://github.com/RetrozDev/to-md/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](package.json)

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

`to-md` is **100% rule-based — no AI, no model calls, no external APIs, no API
keys**. It fetches a page, strips navigation, ads and boilerplate with a
Readability-style heuristic extractor, then converts the surviving HTML to
Markdown with a real HTML→MD converter (`<p>` → text, `<strong>` → `**`,
`<h1>` → `#`, `<table>` → GFM table, …).

## Quick start

```sh
npm install -g @retroz/to-md

to-md https://example.com/blog/intro-to-kubernetes
```

## Why

LLMs love Markdown but hate web pages. Most articles ship a mountain of nav bars,
cookie banners, "related posts", share widgets and inline scripts before the actual
content. `to-md` collapses all of that into a single, token-efficient Markdown
document you can paste into any prompt:

```sh
to-md https://example.com/blog/... | pbcopy        # macOS: copy to clipboard
to-md https://example.com/blog/... | clip          # Windows: copy to clipboard
to-md https://example.com/blog/... | xclip -sel c  # Linux: copy to clipboard
to-md https://example.com/blog/... > article.md    # save to a file
```

### Pipe straight into an LLM

```sh
# Ask a question about the page (OpenAI-style CLI)
to-md https://example.com/docs/quickstart | openai chat -m gpt-4o "Summarize this"

# Feed a whole page to Claude Code / Codex
to-md https://nodejs.org/api/http.html > http-api.md

# Keep the top of a huge docs page for a limited context window
to-md --max-tokens 4000 https://nodejs.org/api/stream.html | pbcopy
```

## Install

```sh
npm install -g @retroz/to-md   # CLI
npm install @retroz/to-md      # or as a library
```

The binary stays `to-md`. Requires Node.js ≥ 18.17.

## CLI usage

```sh
to-md [options] <url...>
```

| Option | Description |
| --- | --- |
| `-s, --selector <css>` | Extract only the element matching this CSS selector instead of the auto-detected main content. |
| `-r, --raw` | Convert the whole page body instead of the auto-detected main content. |
| `-o, --output <file>` | Write Markdown to a file instead of stdout. |
| `-t, --title <title>` | Override the page title in the header. |
| `--source <url>` | Source URL shown in the header (useful with `--stdin`). |
| `--no-header` | Omit the `# Title` / `> Source:` header. |
| `--max-chars <n>` | Truncate output to approximately `n` characters (cuts at paragraph boundaries). |
| `--max-tokens <n>` | Truncate output to approximately `n` tokens (~4 chars each). |
| `--no-links` | Keep link text but drop URLs (saves tokens). |
| `--no-images` | Drop images. |
| `--stdin` | Read raw HTML from stdin instead of a URL. |
| `--urls-file <file>` | Read page URL(s) from a file (one per line; `#` comments and blank lines ignored). |
| `--timeout <ms>` | Request timeout (default: `30000`). |
| `--ua <string>` | Custom User-Agent. |
| `-q, --quiet` | Suppress warnings on stderr. |
| `-V, --version` | Print the version. |
| `-h, --help` | Show help. |

Multiple URLs are converted in batch mode and concatenated with `---` separators,
each keeping its own `# Title` / `> Source:` header.

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

# Noisy single-page docs? Grab the exact node you want
to-md --selector "#section-3" https://example.com/docs/manual

# Convert a page you already have as HTML (no fetch)
curl -s https://example.com/blog/post | to-md --stdin --source https://example.com/blog/post

# Batch a few sources into one Markdown document for a prompt
to-md https://example.com/docs/a https://example.com/docs/b https://example.com/docs/c

# Scrape a whole site from a URL list (one per line, # comments allowed)
to-md --urls-file docs.txt
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (Markdown written to stdout or file). |
| `1` | Error: bad URL, HTTP failure, non-HTML content, no readable content, invalid options. |

Warnings (e.g. "output truncated") go to stderr and never affect the exit code.

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

Options mirror the CLI flags (`selector`, `raw`, `maxChars`, `maxTokens`,
`timeoutMs`, `userAgent`, `headers`, `includeHeader`, `title`, `links`,
`images`). `markdownFromHtml(html, sourceUrl, options)` converts HTML you already
have (no fetch). Lower-level building blocks are exported too: `fetchDocument`,
`extractContent`, `htmlToMarkdown`, and `ToMdError`.

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

- **JavaScript-rendered pages (SPAs) are not executed.** If the content only
  exists after JS runs, you get whatever is in the static HTML. Use `--raw` to
  see everything that was actually fetched.
- **Bot-protected sites return 403.** Some CDN-fronted sites (e.g. `npmjs.com`,
  many social networks) reject any non-browser request even with a real
  User-Agent. A custom `--ua` helps on some; fully JS-challenged sites won't work
  without a headless browser.
- **Extraction is heuristic.** Most pages are clean on the first pass; a few need
  `--selector` or `--raw`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `no readable main content was found` | Tiny or mostly-JS page. Try `--raw`, or target a node with `--selector`. |
| `status 403 Forbidden` | Site blocks non-browser clients. Try `--ua "<a real Chrome UA>"`; some sites stay blocked. |
| `not an HTML document` | The URL returned JSON/PDF/XML (e.g. an API endpoint). `to-md` only converts HTML. |
| Output stops before you expected | `--max-chars`/`--max-tokens` cut at paragraph boundaries, so output can be shorter than the limit. Raise it or drop the flag. |
| Weird characters | Rare with auto charset detection. If it happens, use `--ua` and report an issue. |

## Development

```sh
npm install
npm run dev -- <url>      # run the CLI in watch mode
npm run check             # typecheck + lint + test + build
```

See [RELEASING.md](./RELEASING.md) for the release process.

## License

MIT
