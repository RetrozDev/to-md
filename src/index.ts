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

interface HeaderInfo {
  title: string;
  sourceUrl: string;
  publishedAt?: string;
  author?: string;
}

function buildHeader(info: HeaderInfo): string {
  const lines: string[] = [];
  if (info.title) lines.push(`# ${info.title}`);
  if (info.sourceUrl) lines.push(`> Source: ${info.sourceUrl}`);
  const meta: string[] = [];
  if (info.publishedAt) meta.push(`Published: ${info.publishedAt}`);
  if (info.author) meta.push(`By: ${info.author}`);
  if (meta.length > 0) lines.push(`> ${meta.join(" · ")}`);
  return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
}

function truncationMarker(markdown: string): string {
  return `\n\n<!-- truncated: showing ~${estimateTokens(markdown)} tokens (~${markdown.length} chars) -->`;
}

function assertSingleLimit(options: ToMdOptions): void {
  if (options.maxChars !== undefined && options.maxTokens !== undefined) {
    throw new Error("use either maxChars or maxTokens, not both");
  }
}

/**
 * Convert an HTML document (already fetched) into clean Markdown, with header
 * and optional truncation. Useful for `--stdin`-style workflows.
 */
export function markdownFromHtml(
  html: string,
  sourceUrl: string,
  options: ToMdOptions = {},
): ToMdResult {
  assertSingleLimit(options);

  const { title, publishedAt, author, html: contentHtml } = extractContent(
    html,
    sourceUrl,
    options,
  );

  // Don't repeat the page title if it already opens the extracted content.
  let body = htmlToMarkdown(contentHtml, {
    links: options.links,
    images: options.images,
  });
  if (title && body.startsWith(`# ${title}`)) {
    body = body.replace(`# ${title}`, "").trimStart();
  }

  const header =
    options.includeHeader === false
      ? ""
      : buildHeader({
          title: options.title ?? title,
          sourceUrl,
          publishedAt,
          author,
        });
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
  if (truncated) {
    markdown += truncationMarker(markdown);
  }

  return {
    title,
    markdown,
    sourceUrl,
    charCount: markdown.length,
    tokenEstimate: estimateTokens(markdown),
    truncated,
  };
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
  const doc = await fetchDocument(url.toString(), options);
  return markdownFromHtml(doc.html, doc.finalUrl, options);
}
