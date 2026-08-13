import { htmlToMarkdown } from "./convert.js";
import { extractContent } from "./extract.js";
import { fetchDocument } from "./fetch.js";
import {
  estimateTokens,
  truncateByChars,
  truncateByTokens,
} from "./truncate.js";
import type { ToMdOptions, ToMdResult } from "./types.js";

export type { ToMdOptions, ToMdResult } from "./types.js";
export { ToMdError } from "./fetch.js";
export { extractContent } from "./extract.js";
export { htmlToMarkdown } from "./convert.js";

function buildHeader(title: string, url: string): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  if (url) lines.push(`> Source: ${url}`);
  return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
}

function assertSingleLimit(options: ToMdOptions): void {
  if (options.maxChars !== undefined && options.maxTokens !== undefined) {
    throw new Error("use either maxChars or maxTokens, not both");
  }
}

/**
 * Fetch a web page and return its main content as clean Markdown.
 *
 * ```ts
 * const { markdown, title } = await toMarkdown("https://example.com/article");
 * ```
 */
export async function toMarkdown(
  url: string | URL,
  options: ToMdOptions = {},
): Promise<ToMdResult> {
  assertSingleLimit(options);

  const doc = await fetchDocument(url.toString(), options);
  const { title, html } = extractContent(doc.html, doc.finalUrl, options);

  // Don't repeat the page title if it already opens the extracted content.
  let body = htmlToMarkdown(html);
  if (title && body.startsWith(`# ${title}`)) {
    body = body.replace(`# ${title}`, "").trimStart();
  }

  const header =
    options.includeHeader === false
      ? ""
      : buildHeader(options.title ?? title, doc.finalUrl);
  let markdown = `${header}${body}`.trim();

  let truncated = false;
  if (options.maxChars !== undefined) {
    const result = truncateByChars(markdown, options.maxChars);
    markdown = result.text;
    truncated = result.truncated;
  } else if (options.maxTokens !== undefined) {
    const result = truncateByTokens(markdown, options.maxTokens);
    markdown = result.text;
    truncated = result.truncated;
  }

  return {
    title,
    markdown,
    sourceUrl: doc.finalUrl,
    charCount: markdown.length,
    tokenEstimate: estimateTokens(markdown),
    truncated,
  };
}
