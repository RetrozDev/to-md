import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractContent } from "./extract.js";
import { htmlToMarkdown } from "./convert.js";

const SAMPLE = readFileSync(
  new URL("./test/fixtures/sample.html", import.meta.url),
  "utf8",
);

const BASE = "https://example.com/guide";

function markdown(html: string = SAMPLE, options = {}) {
  const { html: content } = extractContent(html, BASE, options);
  return htmlToMarkdown(content);
}

describe("extractContent", () => {
  it("picks the page title from og:title", () => {
    const { title } = extractContent(SAMPLE, BASE);
    expect(title).toBe("How to Make Pour-Over Coffee");
  });

  it("extracts the main content, dropping nav, ads and footer", () => {
    const { html } = extractContent(SAMPLE, BASE);
    expect(html).toContain("simple, repeatable");
    expect(html).not.toContain("Home");
    expect(html).not.toContain("Buy our coffee beans");
    expect(html).not.toContain("Copyright 2026");
  });

  it("resolves relative links against the base URL", () => {
    const { html } = extractContent(SAMPLE, BASE);
    expect(html).toContain('href="https://example.com/blog/co2-bloom"');
  });

  it("supports extracting a specific selector", () => {
    const { html } = extractContent(SAMPLE, BASE, { selector: "h2" });
    expect(html).toContain("Rinse the filter");
    expect(html).not.toContain("simple, repeatable");
  });

  it("throws when the selector matches nothing", () => {
    expect(() => extractContent(SAMPLE, BASE, { selector: ".nope" })).toThrow(
      /did not match any element/,
    );
  });

  it("keeps everything when raw is true", () => {
    const { html } = extractContent(SAMPLE, BASE, { raw: true });
    expect(html).toContain("Buy our coffee beans");
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings to ATX", () => {
    expect(markdown()).toContain("## Step 1: Rinse the filter");
  });

  it("converts strong and emphasis", () => {
    expect(markdown()).toContain("**simple, repeatable**");
    expect(markdown()).toContain("*twice*");
  });

  it("converts links to Markdown links", () => {
    expect(markdown()).toContain("[CO2 bloom](https://example.com/blog/co2-bloom)");
  });

  it("converts blockquotes", () => {
    expect(markdown()).toContain(
      "> Good coffee is a matter of balance, not magic.",
    );
  });

  it("converts code to fenced blocks", () => {
    expect(markdown()).toContain("```\nconst ratio = 16;");
  });

  it("converts tables to GFM tables", () => {
    const md = markdown();
    expect(md).toContain("| Grind | Time |");
    expect(md).toContain("| Medium | 3:00 |");
  });

  it("converts lists to Markdown lists", () => {
    expect(markdown()).toContain("-   Use water at **93°C**");
  });

  it("removes boilerplate link farms", () => {
    expect(markdown()).not.toContain("Espresso at home");
    expect(markdown()).not.toContain("Related posts");
  });

  it("removes pure-link nav paragraphs", () => {
    expect(markdown()).not.toContain("Next chapter");
    expect(markdown()).not.toContain("Previous chapter");
  });
});
