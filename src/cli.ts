#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { toMarkdown } from "./index.js";
import { DEFAULT_TIMEOUT_MS } from "./fetch.js";
import type { ToMdOptions } from "./types.js";

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

const program = new Command();

program
  .name("to-md")
  .description(
    "Fetch a web page and print its main content as clean, LLM-friendly Markdown.\n\n" +
      "The page is stripped of navigation, ads and boilerplate, converted to\n" +
      "Markdown and printed to stdout, ready to paste into any LLM.",
  )
  .version(readVersion())
  .argument("<url>", "page URL to convert (http:// or https://)")
  .option("-s, --selector <css>", "extract only the element matching this CSS selector")
  .option("-r, --raw", "convert the whole page instead of the auto-detected main content")
  .option("-o, --output <file>", "write Markdown to a file instead of stdout")
  .option("-t, --title <title>", "override the page title in the header")
  .option("--no-header", "omit the title/source header")
  .option("--max-chars <n>", "truncate output to approximately n characters")
  .option("--max-tokens <n>", "truncate output to approximately n tokens (~4 chars each)")
  .option("--timeout <ms>", `request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`, String(DEFAULT_TIMEOUT_MS))
  .option("--ua <string>", "custom User-Agent")
  .option("-q, --quiet", "suppress warnings on stderr")
  .showHelpAfterError()
  .action(async (url: string, opts: Record<string, unknown>) => {
    if (opts.raw && opts.selector) {
      program.error("options --raw and --selector are mutually exclusive");
    }
    if (opts.maxChars !== undefined && opts.maxTokens !== undefined) {
      program.error("options --max-chars and --max-tokens are mutually exclusive");
    }

    const options: ToMdOptions = {
      title: opts.title as string | undefined,
      selector: opts.selector as string | undefined,
      raw: opts.raw as boolean | undefined,
      maxChars:
        opts.maxChars !== undefined
          ? parseIntOption(String(opts.maxChars), "--max-chars")
          : undefined,
      maxTokens:
        opts.maxTokens !== undefined
          ? parseIntOption(String(opts.maxTokens), "--max-tokens")
          : undefined,
      timeoutMs: parseIntOption(String(opts.timeout), "--timeout"),
      userAgent: opts.ua as string | undefined,
      includeHeader: opts.header as boolean | undefined,
    };

    try {
      const result = await toMarkdown(url, options);

      if (result.markdown.length === 0) {
        throw new Error("the page produced no Markdown output");
      }

      const output = `${result.markdown}\n`;

      if (opts.output) {
        writeFileSync(String(opts.output), output, "utf8");
        if (!opts.quiet) {
          process.stderr.write(
            `to-md: wrote ${result.markdown.length} chars to ${String(opts.output)}\n`,
          );
        }
      } else {
        process.stdout.write(output);
      }

      if (result.truncated && !opts.quiet) {
        process.stderr.write(
          `to-md: output truncated to ${result.charCount} chars (~${result.tokenEstimate} tokens)\n`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`to-md: error: ${message}\n`);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
