import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Rewrite every `href` / `src` / `srcset` attribute to an absolute URL so the
 * generated Markdown keeps working outside the original page.
 */
export function resolveUrls(
  $: CheerioAPI,
  $root: Cheerio<AnyNode>,
  baseUrl: string,
): void {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return;
  }

  const resolve = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return new URL(trimmed, base).toString();
    } catch {
      return value;
    }
  };

  $root.find("a[href], img[src], source[src], video[poster], blockquote[cite]").each((_, el) => {
    const $el = $(el);
    if (el.tagName === "a" && $el.attr("href")) {
      $el.attr("href", resolve($el.attr("href")!));
    } else if (el.tagName === "img" && $el.attr("src")) {
      $el.attr("src", resolve($el.attr("src")!));
    } else if (el.tagName === "source" && $el.attr("src")) {
      $el.attr("src", resolve($el.attr("src")!));
    } else if (el.tagName === "video" && $el.attr("poster")) {
      $el.attr("poster", resolve($el.attr("poster")!));
    } else if (el.tagName === "blockquote" && $el.attr("cite")) {
      $el.attr("cite", resolve($el.attr("cite")!));
    }
  });

  $root.find("img[srcset], source[srcset]").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (!srcset) return;
    const rewritten = srcset
      .split(",")
      .map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        if (!url) return part;
        return [resolve(url), ...rest].join(" ");
      })
      .join(", ");
    $el.attr("srcset", rewritten);
  });
}
