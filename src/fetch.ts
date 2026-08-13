import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";
import type { FetchedDocument, ToMdOptions } from "./types.js";

export const DEFAULT_USER_AGENT = "to-md/0.1.0";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export class ToMdError extends Error {
  override name = "ToMdError";
}

/**
 * Match a hostname against a `NO_PROXY` entry (curl conventions): exact host,
 * `.domain` or `*.domain` for subdomains, or `*` for everything.
 */
function matchesNoProxy(hostname: string, noProxy: string): boolean {
  const host = hostname.toLowerCase();
  return noProxy
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(2);
        return host === suffix || host.endsWith("." + suffix);
      }
      if (entry.startsWith(".")) {
        const suffix = entry.slice(1);
        return host === suffix || host.endsWith("." + suffix);
      }
      return host === entry;
    });
}

/**
 * Resolve the proxy to use for a target URL, in conventional precedence order:
 * explicit option, `NO_PROXY` bypass, then the protocol-matching env variable.
 */
function proxyUrlFor(url: URL, explicit: string | undefined): string | undefined {
  if (explicit) return explicit;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (noProxy && matchesNoProxy(url.hostname, noProxy)) return undefined;
  const names =
    url.protocol === "https:" ? ["HTTPS_PROXY", "https_proxy"] : ["HTTP_PROXY", "http_proxy"];
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function buildDispatcher(proxy: string | undefined): Dispatcher | undefined {
  if (!proxy) return undefined;
  try {
    new URL(proxy);
  } catch {
    throw new ToMdError(`invalid proxy URL "${proxy}"`);
  }
  return new ProxyAgent(proxy);
}

function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToMdError(`"${raw}" is not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToMdError(
      `unsupported protocol "${url.protocol}". Only http:// and https:// are supported`,
    );
  }
  return url;
}

/**
 * Detect the character set from the response `Content-Type` header, falling
 * back to a `<meta charset>` tag found in the first bytes of the document.
 */
function detectCharset(contentType: string, bytes: Uint8Array): string | null {
  const header = /charset=["']?([\w.-]+)/i.exec(contentType);
  if (header?.[1]) return header[1];

  const head = Buffer.from(bytes.subarray(0, 2048)).toString("latin1");
  const meta = /<meta[^>]+charset=["']?([\w.-]+)/i.exec(head);
  return meta?.[1] ?? null;
}

function decode(bytes: Uint8Array, charset: string | null): string {
  let label = charset ?? "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    if (label !== "utf-8") {
      label = "utf-8";
      try {
        return new TextDecoder(label).decode(bytes);
      } catch {
        // unreachable
      }
    }
    // Last resort for exotic labels: force a byte-preserving single-byte decode.
    return Buffer.from(bytes).toString("latin1");
  }
}

/**
 * Fetch a page and return its decoded HTML.
 */
export async function fetchDocument(
  rawUrl: string,
  options: ToMdOptions = {},
): Promise<FetchedDocument> {
  const url = assertHttpUrl(rawUrl);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const dispatcher = buildDispatcher(proxyUrlFor(url, options.proxy));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  let response: Response;
  try {
    const init: Parameters<typeof fetch>[1] = {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en,en-US;q=0.9",
        ...options.headers,
      },
    };
    if (dispatcher) {
      init.dispatcher = dispatcher as unknown as typeof init.dispatcher;
    }
    response = await fetch(url, init);
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === "AbortError"
        ? `request timed out after ${timeoutMs}ms`
        : cause instanceof Error
          ? cause.message
          : String(cause);
    throw new ToMdError(`failed to fetch ${url.href}: ${reason}`, { cause });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ToMdError(
      `request to ${url.href} failed with status ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "text/html";
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new ToMdError(
      `"${url.href}" returned "${contentType}", not an HTML document`,
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new ToMdError(
      `"${url.href}" is ${contentLength} bytes, exceeding the ${maxBytes} byte limit`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ToMdError(`"${url.href}" returned an empty response body`);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ToMdError(
          `"${url.href}" exceeds the ${maxBytes} byte limit`,
        );
      }
      chunks.push(value);
    }
  }

  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const html = decode(bytes, detectCharset(contentType, bytes));

  return {
    url: url.href,
    finalUrl: response.url || url.href,
    html,
    contentType: contentType.split(";")[0]!.trim(),
  };
}
