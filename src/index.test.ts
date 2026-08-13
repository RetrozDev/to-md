import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { markdownFromHtml, toMarkdown } from "./index.js";

const SAMPLE = readFileSync(
  new URL("./test/fixtures/sample.html", import.meta.url),
  "utf8",
);

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    switch (url.pathname) {
      case "/guide":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(SAMPLE);
        break;
      case "/redirect":
        res.writeHead(302, { location: "/guide" });
        res.end();
        break;
      case "/404":
        res.writeHead(404, { "content-type": "text/html" });
        res.end("not found");
        break;
      case "/binary":
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end("%PDF-1.4");
        break;
      case "/empty":
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body></body></html>");
        break;
      default:
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>no content here</body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") {
    base = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("toMarkdown", () => {
  it("fetches a page and returns clean Markdown with a header", async () => {
    const result = await toMarkdown(`${base}/guide`);
    expect(result.title).toBe("How to Make Pour-Over Coffee");
    expect(result.markdown).toContain("# How to Make Pour-Over Coffee");
    expect(result.markdown).toContain("> Source: " + base + "/guide");
    expect(result.markdown).toContain("**simple, repeatable**");
    expect(result.markdown).not.toContain("Buy our coffee beans");
    expect(result.markdown).not.toContain("Copyright 2026");
    expect(result.charCount).toBe(result.markdown.length);
    expect(result.truncated).toBe(false);
  });

  it("follows redirects and reports the final URL", async () => {
    const result = await toMarkdown(`${base}/redirect`);
    expect(result.sourceUrl).toBe(`${base}/guide`);
    expect(result.markdown).toContain("> Source: " + base + "/guide");
  });

  it("extracts only the selector when requested", async () => {
    const result = await toMarkdown(`${base}/guide`, { selector: "h2" });
    expect(result.markdown).toContain("Rinse the filter");
    expect(result.markdown).not.toContain("simple, repeatable");
  });

  it("keeps the whole page in raw mode", async () => {
    const result = await toMarkdown(`${base}/guide`, { raw: true });
    expect(result.markdown).toContain("Buy our coffee beans");
  });

  it("omits the header with includeHeader: false", async () => {
    const result = await toMarkdown(`${base}/guide`, { includeHeader: false });
    expect(result.markdown).not.toContain("# How to Make Pour-Over Coffee");
    expect(result.markdown).not.toContain("> Source:");
  });

  it("overrides the title", async () => {
    const result = await toMarkdown(`${base}/guide`, { title: "My Title" });
    expect(result.markdown).toContain("# My Title");
  });

  it("truncates by maxChars at a paragraph boundary", async () => {
    const result = await toMarkdown(`${base}/guide`, { maxChars: 120 });
    expect(result.truncated).toBe(true);
    expect(result.markdown).toContain("<!-- truncated");
    // Truncation + the marker can slightly exceed the requested cap.
    expect(result.markdown.length).toBeLessThanOrEqual(120 + 80);
  });

  it("truncates by maxTokens", async () => {
    const result = await toMarkdown(`${base}/guide`, { maxTokens: 30 });
    expect(result.truncated).toBe(true);
  });

  it("rejects maxChars combined with maxTokens", async () => {
    await expect(
      toMarkdown(`${base}/guide`, { maxChars: 100, maxTokens: 100 }),
    ).rejects.toThrow(/either.*or/);
  });

  it("throws on HTTP errors", async () => {
    await expect(toMarkdown(`${base}/404`)).rejects.toThrow(/status 404/);
  });

  it("throws on non-HTML content", async () => {
    await expect(toMarkdown(`${base}/binary`)).rejects.toThrow(/not an HTML document/);
  });

  it("throws when no readable content exists", async () => {
    await expect(toMarkdown(`${base}/empty`)).rejects.toThrow(/no readable main content/);
  });

  it("rejects non-http(s) URLs", async () => {
    await expect(toMarkdown("file:///tmp/x.html")).rejects.toThrow(/unsupported protocol/);
  });
});

describe("markdownFromHtml", () => {
  it("converts HTML without fetching", () => {
    const result = markdownFromHtml(SAMPLE, `${base}/guide`);
    expect(result.markdown).toContain("**simple, repeatable**");
    expect(result.sourceUrl).toBe(`${base}/guide`);
  });

  it("includes published date and author in the header", () => {
    const result = markdownFromHtml(SAMPLE, `${base}/guide`);
    expect(result.markdown).toContain("Published: 2026-08-13T10:00:00Z");
    expect(result.markdown).toContain("By: Jane Doe");
  });

  it("drops link URLs with links: false", () => {
    const result = markdownFromHtml(SAMPLE, `${base}/guide`, { links: false });
    expect(result.markdown).not.toContain("[CO2 bloom](http");
    expect(result.markdown).toContain("CO2 bloom");
  });

  it("drops images with images: false", () => {
    const result = markdownFromHtml(SAMPLE, `${base}/guide`, { images: false });
    expect(result.markdown).not.toContain("![Pour-over setup]");
    expect(result.markdown).toContain("**simple, repeatable**");
  });

  it("appends a truncation marker when capped", () => {
    const result = markdownFromHtml(SAMPLE, `${base}/guide`, { maxChars: 80 });
    expect(result.truncated).toBe(true);
    expect(result.markdown).toContain("<!-- truncated");
  });
});
