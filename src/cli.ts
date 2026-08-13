#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { markdownFromHtml, toMarkdown } from "./index.js";
import { DEFAULT_TIMEOUT_MS } from "./fetch.js";
import type { ToMdOptions, ToMdResult } from "./types.js";

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseIntOption(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer (got "${value}")`);
  }
  return parsed;
}

interface CliOptions {
  selector?: string;
  raw?: boolean;
  output?: string;
  title?: string;
  header?: boolean;
  maxChars?: number;
  maxTokens?: number;
  timeout: string;
  ua?: string;
  quiet?: boolean;
  stdin?: boolean;
  source?: string;
  links?: boolean;
  images?: boolean;
}

function toOptions(opts: CliOptions): ToMdOptions {
  return {
    title: opts.title,
    selector: opts.selector,
    raw: opts.raw,
    links: opts.links,
    images: opts.images,
    maxChars:
      opts.maxChars !== undefined ? parseIntOption(String(opts.maxChars), "--max-chars") : undefined,
    maxTokens:
      opts.maxTokens !== undefined ? parseIntOption(String(opts.maxTokens), "--max-tokens") : undefined,
    timeoutMs: parseIntOption(String(opts.timeout), "--timeout"),
    userAgent: opts.ua,
    includeHeader: opts.header,
  };
}

function emit(result: ToMdResult, opts: CliOptions): void {
  if (result.markdown.length === 0) {
    throw new Error("the page produced no Markdown output");
  }
  const text = `${result.markdown}\n`;

  if (opts.output) {
    writeFileSync(String(opts.output), text, "utf8");
    if (!opts.quiet) {
      process.stderr.write(
        `to-md: wrote ${result.markdown.length} chars to ${String(opts.output)}\n`,
      );
    }
  } else {
    process.stdout.write(text);
  }

  if (result.truncated && !opts.quiet) {
    process.stderr.write(
      `to-md: output truncated to ${result.charCount} chars (~${result.tokenEstimate} tokens)\n`,
    );
  }
}

const program = new Command();

program
  .name("to-md")
  .description(
    "Fetch web page(s) and print their main content as clean, LLM-friendly Markdown.\n\n" +
      "Pages are stripped of navigation, ads and boilerplate, converted to Markdown\n" +
      "and printed to stdout, ready to paste into any LLM.",
  )
  .version(readVersion())
  .argument("[urls...]", "page URL(s) to convert (http:// or https://)")
  .option("-s, --selector <css>", "extract only the element matching this CSS selector")
  .option("-r, --raw", "convert the whole page instead of the auto-detected main content")
  .option("-o, --output <file>", "write Markdown to a file instead of stdout")
  .option("-t, --title <title>", "override the page title in the header")
  .option("--source <url>", "source URL shown in the header (used with --stdin)")
  .option("--no-header", "omit the title/source header")
  .option("--max-chars <n>", "truncate output to approximately n characters")
  .option("--max-tokens <n>", "truncate output to approximately n tokens (~4 chars each)")
  .option("--no-links", "keep link text but drop URLs (saves tokens)")
  .option("--no-images", "drop images")
  .option("--stdin", "read raw HTML from stdin instead of a URL")
  .option("--timeout <ms>", `request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`, String(DEFAULT_TIMEOUT_MS))
  .option("--ua <string>", "custom User-Agent")
  .option("-q, --quiet", "suppress warnings on stderr")
  .showHelpAfterError()
  .action(async (urls: string[], opts: CliOptions) => {
    if (opts.raw && opts.selector) {
      program.error("options --raw and --selector are mutually exclusive");
    }
    if (opts.maxChars !== undefined && opts.maxTokens !== undefined) {
      program.error("options --max-chars and --max-tokens are mutually exclusive");
    }
    if (opts.stdin && urls.length > 0) {
      program.error("option --stdin cannot be combined with URL arguments");
    }
    if (!opts.stdin && urls.length === 0) {
      program.error("missing required argument <url> (or use --stdin to read HTML from stdin)");
    }

    try {
      const options = toOptions(opts);

      if (opts.stdin) {
        const html = readFileSync(0, "utf8");
        const result = markdownFromHtml(html, opts.source ?? "", options);
        emit(result, opts);
        return;
      }

      const results: ToMdResult[] = [];
      for (const url of urls) {
        const result = await toMarkdown(url, options);
        results.push(result);
        if (result.truncated && !opts.quiet) {
          process.stderr.write(
            `to-md: output truncated to ${result.charCount} chars (~${result.tokenEstimate} tokens)\n`,
          );
        }
      }

      if (results.length === 1) {
        emit(results[0]!, opts);
        return;
      }

      const combined = results
        .map((r) => r.markdown)
        .join("\n\n---\n\n");
      if (combined.length === 0) {
        throw new Error("the pages produced no Markdown output");
      }
      const text = `${combined}\n`;
      if (opts.output) {
        writeFileSync(String(opts.output), text, "utf8");
        if (!opts.quiet) {
          process.stderr.write(
            `to-md: wrote ${combined.length} chars to ${String(opts.output)}\n`,
          );
        }
      } else {
        process.stdout.write(text);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`to-md: error: ${message}\n`);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
