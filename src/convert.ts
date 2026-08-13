import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface ConvertOptions {
  links?: boolean;
  images?: boolean;
}

const INVISIBLE_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "form",
];

// Turndown instances are configured per option combination and cached, since
// `remove()` and `addRule()` mutate a service's rule table.
const serviceCache = new Map<string, TurndownService>();

function getService({ links = true, images = true }: ConvertOptions): TurndownService {
  const key = `${links ? "links" : "nolinks"}:${images ? "img" : "noimg"}`;
  const cached = serviceCache.get(key);
  if (cached) return cached;

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
  td.remove([...INVISIBLE_TAGS]);

  if (!images) {
    // `addRule` prepends to the core rules, so this wins over the built-in
    // `image` rule (which `remove(['img'])` would never reach).
    td.addRule("noImages", {
      filter: "img",
      replacement: () => "",
    });
  }
  if (!links) {
    td.addRule("linksOff", {
      filter: "a",
      replacement: (content) => content,
    });
  }

  serviceCache.set(key, td);
  return td;
}

/**
 * Convert an HTML fragment to Markdown.
 */
export function htmlToMarkdown(
  html: string,
  options: ConvertOptions = {},
): string {
  return getService(options)
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
