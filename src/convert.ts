import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let service: TurndownService | null = null;

/**
 * A shared, configured Turndown instance. Configured for compact, LLM-friendly
 * output: ATX headings, fenced code blocks, `-` bullets and `*` emphasis.
 */
function getService(): TurndownService {
  if (service) return service;

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  td.use(gfm);
  // Boilerplate removal is owned by the extractor (`extract.ts`) so raw mode
  // can keep structural tags. Only strip tags with no text value here.
  td.remove([
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "object",
    "embed",
    "form",
  ]);

  service = td;
  return td;
}

/**
 * Convert an HTML fragment to Markdown.
 */
export function htmlToMarkdown(html: string): string {
  return getService()
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
