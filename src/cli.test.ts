import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/guide") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(SAMPLE);
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
    expect(stdout).toContain("<url>");
  });
});
