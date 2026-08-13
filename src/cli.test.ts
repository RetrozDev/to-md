import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { startForwardProxy } from "./test/helpers.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const SAMPLE = readFileSync(
  new URL("./test/fixtures/sample.html", import.meta.url),
  "utf8",
);
const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));
const TSX = fileURLToPath(
  new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
);

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      TSX,
      CLI,
      ...args,
    ]);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: e.code ?? 1,
    };
  }
}

async function runCliWithInput(args: string[], input: string): Promise<CliResult> {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX, CLI, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", () => resolve({ stdout, stderr, code: 1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

let server: Server;
let base = "";

const OTHER = `<!doctype html><html><head>
<title>Other Page</title>
<meta property="article:published_time" content="2026-08-01T08:00:00Z" />
</head><body>
<main>
  <h1>Other Page</h1>
  <p>This second page is used to verify that batch mode concatenates several articles into a single Markdown document. It carries enough readable sentences for the extractor to pick a main content container and convert everything into clean, token-friendly Markdown for an LLM.</p>
</main>
</body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/guide") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(SAMPLE);
    } else if (url.pathname === "/other") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(OTHER);
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>nothing</body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") {
    base = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("to-md CLI", () => {
  it("prints the page as Markdown to stdout", async () => {
    const { stdout, stderr, code } = await runCli([`${base}/guide`]);
    expect(code).toBe(0);
    expect(stdout).toContain("# How to Make Pour-Over Coffee");
    expect(stdout).toContain("**simple, repeatable**");
    expect(stdout).toContain("> Source: " + base + "/guide");
    expect(stderr).toBe("");
  });

  it("supports --selector", async () => {
    const { stdout, code } = await runCli([
      "--selector",
      "h2",
      `${base}/guide`,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("Rinse the filter");
    expect(stdout).not.toContain("simple, repeatable");
  });

  it("supports --no-header", async () => {
    const { stdout, code } = await runCli(["--no-header", `${base}/guide`]);
    expect(code).toBe(0);
    expect(stdout).not.toContain("# How to Make Pour-Over Coffee");
  });

  it("writes to a file with -o and reports stats on stderr", async () => {
    const dir = mkdtempSync(join(tmpdir(), "to-md-"));
    const out = join(dir, "out.md");
    try {
      const { stdout, stderr, code } = await runCli([
        "-o",
        out,
        `${base}/guide`,
      ]);
      expect(code).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain("wrote");
      expect(readFileSync(out, "utf8")).toContain("**simple, repeatable**");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero with an error message for bad URLs", async () => {
    const { stdout, stderr, code } = await runCli(["not-a-url"]);
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("error");
  });

  it("rejects --raw combined with --selector", async () => {
    const { stderr, code } = await runCli([
      "--raw",
      "--selector",
      "p",
      `${base}/guide`,
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("mutually exclusive");
  });

  it("prints --version", async () => {
    const { stdout, code } = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints --help", async () => {
    const { stdout, code } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("[urls...]");
  });

  it("reads raw HTML from stdin with --stdin", async () => {
    const { stdout, code } = await runCliWithInput(["--stdin"], SAMPLE);
    expect(code).toBe(0);
    expect(stdout).toContain("# How to Make Pour-Over Coffee");
    expect(stdout).toContain("**simple, repeatable**");
    expect(stdout).not.toContain("> Source:");
  });

  it("uses --source with --stdin for the header", async () => {
    const { stdout, code } = await runCliWithInput(
      ["--stdin", "--source", "https://example.com/pasted"],
      SAMPLE,
    );
    expect(code).toBe(0);
    expect(stdout).toContain("> Source: https://example.com/pasted");
  });

  it("rejects --stdin combined with a URL", async () => {
    const { stderr, code } = await runCliWithInput(
      ["--stdin", `${base}/guide`],
      SAMPLE,
    );
    expect(code).not.toBe(0);
    expect(stderr).toContain("--stdin");
  });

  it("drops link URLs with --no-links", async () => {
    const { stdout, code } = await runCli(["--no-links", `${base}/guide`]);
    expect(code).toBe(0);
    expect(stdout).not.toContain("[CO2 bloom](http");
    expect(stdout).toContain("CO2 bloom");
  });

  it("drops images with --no-images", async () => {
    const { stdout, code } = await runCli(["--no-images", `${base}/guide`]);
    expect(code).toBe(0);
    expect(stdout).not.toContain("![Pour-over setup]");
  });

  it("concatenates multiple URLs in batch mode", async () => {
    const { stdout, code } = await runCli([
      `${base}/guide`,
      `${base}/other`,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("# How to Make Pour-Over Coffee");
    expect(stdout).toContain("---");
    expect(stdout).toContain("# Other Page");
  });

  it("errors when no URL and no --stdin", async () => {
    const { stderr, code } = await runCli([]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("missing required argument");
  });

  it("reads URLs from a file with --urls-file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "to-md-"));
    const list = join(dir, "urls.txt");
    try {
      writeFileSync(
        list,
        [
          "# scrape list",
          "",
          `${base}/guide`,
          `${base}/other`,
          "# another comment",
        ].join("\n"),
        "utf8",
      );
      const { stdout, code } = await runCli(["--urls-file", list]);
      expect(code).toBe(0);
      expect(stdout).toContain("# How to Make Pour-Over Coffee");
      expect(stdout).toContain("# Other Page");
      expect(stdout).toContain("---");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dedupes identical URLs from --urls-file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "to-md-"));
    const list = join(dir, "urls.txt");
    try {
      writeFileSync(
        list,
        [`${base}/guide`, `${base}/guide`].join("\n"),
        "utf8",
      );
      const { stdout, code } = await runCli(["--urls-file", list]);
      expect(code).toBe(0);
      const occurrences = stdout.split("# How to Make Pour-Over Coffee").length - 1;
      expect(occurrences).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("combines positional URLs with --urls-file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "to-md-"));
    const list = join(dir, "urls.txt");
    try {
      writeFileSync(list, `${base}/other\n`, "utf8");
      const { stdout, code } = await runCli([`${base}/guide`, "--urls-file", list]);
      expect(code).toBe(0);
      expect(stdout).toContain("# How to Make Pour-Over Coffee");
      expect(stdout).toContain("# Other Page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when --urls-file does not exist", async () => {
    const { stderr, code } = await runCli([
      "--urls-file",
      join(tmpdir(), "to-md-missing.txt"),
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("could not read urls file");
  });

  it("routes requests through --proxy", async () => {
    const proxy = await startForwardProxy();
    try {
      const { stdout, code } = await runCli([
        "--proxy",
        `http://127.0.0.1:${proxy.port}`,
        `${base}/guide`,
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain("**simple, repeatable**");
      expect(proxy.hits()).toBeGreaterThan(0);
    } finally {
      await proxy.close();
    }
  });
});
