import { load as cheerioLoad } from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ExtractedContent, ToMdOptions } from "./types.js";
import { resolveUrls } from "./urls.js";

const POSITIVE_HINTS =
  /article|body|content|entry|hentry|h-entry|main|page|post|text|blog|story|document/i;
const NEGATIVE_HINTS =
  /combx|comment|community|disqus|extra|footer|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|share|related|promo|toolbox|masthead|breadcrumb|metadata/i;

const INVISIBLE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "audio",
  "video",
  "embed",
  "object",
  "iframe",
  "form",
  "button",
  "select",
  "input",
  "textarea",
  "head",
];

const BOILERPLATE_SELECTORS = ["nav", "footer", "header", "aside"];

const BLOCK_TAGS = new Set([
  "article",
  "main",
  "section",
  "div",
  "td",
  "pre",
  "ul",
  "ol",
  "blockquote",
  "p",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const MIN_PARAGRAPH_LENGTH = 25;
const TOP_CANDIDATE_MIN_TEXT = 140;
const FALLBACK_MIN_TEXT = 200;

interface Candidate {
  el: Element;
  score: number;
  text: string;
}

function isHidden(el: Element): boolean {
  const style = (el.attribs["style"] ?? "").toLowerCase();
  return (
    el.attribs["hidden"] !== undefined ||
    el.attribs["aria-hidden"] === "true" ||
    /display\s*:\s*none/.test(style) ||
    /visibility\s*:\s*hidden/.test(style)
  );
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function removeComments($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  $root.find("*").contents().filter((_, n) => n.type === "comment").remove();
  $root.contents().filter((_, n) => n.type === "comment").remove();
}

function removeInvisible($: CheerioAPI): void {
  $(INVISIBLE_SELECTORS.join(", ")).remove();
  $("*").each((_, rawEl) => {
    if (isHidden(rawEl as Element)) $(rawEl).remove();
  });
}

function removeUnwanted($: CheerioAPI): void {
  removeInvisible($);
  $(BOILERPLATE_SELECTORS.join(", ")).remove();
}

function linkDensity($: CheerioAPI, $el: Cheerio<AnyNode>, text: string): number {
  const textLen = text.replace(/\s+/g, "").length;
  if (textLen === 0) return 1;
  const linkLen = $el.find("a").text().replace(/\s+/g, "").length;
  return Math.min(linkLen / textLen, 1);
}

function tagBonus(el: Element): number {
  const tag = el.tagName.toLowerCase();
  if (tag === "article" || tag === "main") return 35;
  if (tag === "section") return 15;
  if (tag === "td") return 20;
  if (el.attribs["role"] === "main") return 35;
  return 0;
}

function hintWeight(el: Element): number {
  const id = el.attribs["id"] ?? "";
  const cls = el.attribs["class"] ?? "";
  let w = 0;
  if (POSITIVE_HINTS.test(id)) w += 25;
  if (POSITIVE_HINTS.test(cls)) w += 25;
  if (NEGATIVE_HINTS.test(id)) w -= 25;
  if (NEGATIVE_HINTS.test(cls)) w -= 25;
  return w;
}

function scoreCandidate($: CheerioAPI, el: Element): Candidate {
  const $el = $(el);
  const text = cleanText($el.text());

  let score = 0;
  $el.find("p").each((_, p) => {
    const t = cleanText($(p).text());
    if (t.length < MIN_PARAGRAPH_LENGTH) return;
    const commas = (t.match(/,/g) ?? []).length;
    score += 1 + commas + Math.min(Math.floor(t.length / 100), 3);
  });
  // Element whose content is not paragraph-based (lists, tables, code…).
  if (score === 0) {
    const commas = (text.match(/,/g) ?? []).length;
    score = 1 + commas + Math.min(Math.floor(text.length / 100), 3);
  }

  score *= 1 - linkDensity($, $el, text);
  score += tagBonus(el) + hintWeight(el);
  return { el, score, text };
}

function collectCandidates($: CheerioAPI): Candidate[] {
  const candidates: Candidate[] = [];
  $("body *").each((_, rawEl) => {
    const el = rawEl as Element;
    const tag = el.tagName.toLowerCase();
    if (!BLOCK_TAGS.has(tag) && !HEADING_TAGS.has(tag)) return;

    const $el = $(el);
    const text = cleanText($el.text());
    if (text.length < MIN_PARAGRAPH_LENGTH) return;
    if ($el.parents("pre, code, table, select, option, head").length > 0) return;

    // Only score container-level nodes: skip leaf paragraphs and text-only tags
    // so their ancestors win.
    const $children = $el.children();
    if ($children.length === 0) return;

    candidates.push(scoreCandidate($, el));
  });
  return candidates;
}

function pickBest(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => b.score - a.score || b.text.length - a.text.length,
  );
  const best = candidates[0]!;
  if (best.score <= 0 || best.text.length < TOP_CANDIDATE_MIN_TEXT) return null;
  return best;
}

function unwrapRedundantWrappers($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  $root.find("div, section, main, article").each((_, el) => {
    const $el = $(el);
    if (cleanText($el.text()).length === 0) {
      $el.remove();
      return;
    }
    const hasDirectText =
      $el
        .contents()
        .filter((_, n) => n.type === "text" && cleanText((n.data ?? "")).length > 0)
        .length > 0;
    const children = $el.children();
    if (children.length === 0 || hasDirectText) return;

    const allBlocks = children
      .toArray()
      .every((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) || HEADING_TAGS.has(c.tagName.toLowerCase()));
    if (!allBlocks) return;

    // Keep meaningful structural elements.
    if ($el.find("table, ul, ol, pre, blockquote, figure, img, picture").length > 0) {
      return;
    }
    $el.replaceWith($el.contents());
  });
}

function dropNearEmpty($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  $root.find("div, section, span, p").each((_, el) => {
    const $el = $(el);
    const text = cleanText($el.text());
    const hasMedia = $el.find("img, picture, video, figure, pre, table, blockquote").length > 0;
    if (text.length === 0 && !hasMedia) {
      $el.remove();
    }
  });
}

function dropLinkFarms($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  $root.find("div, section, aside, ul").each((_, el) => {
    const $el = $(el);
    const text = cleanText($el.text());
    if (text.length === 0) return;

    // Blocks that are pure link lists ("Related posts", "Share", "Tags"…)
    // where every <li> contains only a link.
    const $lis = $el.find("li");
    if ($lis.length > 0) {
      let allPureLinks = true;
      $lis.each((_, li) => {
        const $li = $(li);
        const t = cleanText($li.text());
        if (t.length === 0 || linkDensity($, $li, t) < 0.85) {
          allPureLinks = false;
          return false;
        }
        return true;
      });
      if (
        allPureLinks &&
        $el.find("p, pre, blockquote, table, img, figure").length === 0
      ) {
        $el.remove();
        return;
      }
    }

    // Generic high link-density blocks carrying no real content.
    const hasRealContent = $el.find(
      "p, h1, h2, h3, h4, h5, h6, pre, blockquote, table, img, figure",
    ).length > 0;
    if (hasRealContent) return;
    if (linkDensity($, $el, text) > 0.7) {
      $el.remove();
    }
  });
}

function dropLinkParagraphs($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  // "Next: [a], Previous: [b]" style nav lines: short paragraphs whose text is
  // dominated by links.
  $root.find("p").each((_, p) => {
    const $p = $(p);
    const text = cleanText($p.text());
    if (text.length === 0) return;
    const $links = $p.find("a");
    if ($links.length < 2) return;

    const textLen = text.replace(/\s+/g, "").length;
    let linkLen = 0;
    $links.each((_, a) => {
      linkLen += cleanText($(a).text()).replace(/\s+/g, "").length;
    });
    const nonLinkLen = textLen - linkLen;
    if (linkDensity($, $p, text) >= 0.5 && nonLinkLen <= 40) {
      $p.remove();
    }
  });
}

function cleanContent($: CheerioAPI, $root: Cheerio<AnyNode>): void {
  unwrapRedundantWrappers($, $root);
  dropNearEmpty($, $root);
  dropLinkFarms($, $root);
  dropLinkParagraphs($, $root);
  // Drop anchor-only links (empty text, no image).
  $root
    .find("a")
    .filter((_, a) => {
      const $a = $(a);
      return cleanText($a.text()).length === 0 && $a.find("img").length === 0;
    })
    .remove();
}

function getTitle($: CheerioAPI): string {
  const og = $('meta[property="og:title"]').attr("content");
  if (og?.trim()) return cleanText(og);
  const twitter = $('meta[name="twitter:title"]').attr("content");
  if (twitter?.trim()) return cleanText(twitter);
  const title = $("title").first().text();
  if (title.trim()) return cleanText(title);
  const h1 = $("h1").first().text();
  if (h1.trim()) return cleanText(h1);
  return "";
}

/**
 * Extract the main content of an HTML document as a clean subtree, resolving
 * relative URLs against `baseUrl`.
 */
export function extractContent(
  html: string,
  baseUrl: string,
  options: ToMdOptions = {},
): ExtractedContent {
  const $ = cheerioLoad(html);
  const title = getTitle($);

  let $root: Cheerio<AnyNode>;

  if (options.selector) {
    const selected = $(options.selector).first();
    if (selected.length === 0) {
      throw new Error(`selector "${options.selector}" did not match any element`);
    }
    removeUnwanted($);
    $root = $("<div>").append(selected.clone());
  } else if (options.raw) {
    removeInvisible($);
    $root = $("<div>").append($("body").contents());
  } else {
    removeUnwanted($);
    const candidates = collectCandidates($);
    const best = pickBest(candidates);
    if (best) {
      $root = $("<div>").append($(best.el).clone());
    } else {
      // Fallback: whole body (minus boilerplate) if it holds enough text.
      const body = $("<div>").append($("body").contents());
      if (cleanText(body.text()).length < FALLBACK_MIN_TEXT) {
        throw new Error("no readable main content was found on this page");
      }
      $root = body;
    }
  }

  removeComments($, $root);
  cleanContent($, $root);
  resolveUrls($, $root, baseUrl);

  return { title, html: $.html($root), baseUrl };
}
