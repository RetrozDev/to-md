/**
 * Public types for `to-md`.
 */

export interface ToMdOptions {
  /**
   * Override the page title used in the header.
   */
  title?: string;
  /**
   * Extract only the element matching this CSS selector instead of the
   * auto-detected main content.
   */
  selector?: string;
  /**
   * Skip main-content extraction and convert the whole page body.
   */
  raw?: boolean;
  /**
   * Truncate the final Markdown to approximately this many characters.
   * Mutually exclusive with {@link maxTokens}.
   */
  maxChars?: number;
  /**
   * Truncate the final Markdown to approximately this many tokens,
   * estimated as characters / 4. Mutually exclusive with {@link maxChars}.
   */
  maxTokens?: number;
  /**
   * Keep Markdown links (`[text](url)`). Defaults to `true`. When `false`,
   * link text is kept but URLs are dropped (saves tokens).
   */
  links?: boolean;
  /**
   * Keep images (`![alt](src)`). Defaults to `true`.
   */
  images?: boolean;
  /**
   * Request timeout in milliseconds. Defaults to 30_000.
   */
  timeoutMs?: number;
  /**
   * User-Agent sent with the request.
   */
  userAgent?: string;
  /**
   * Maximum response size in bytes. Defaults to 5 MB.
   */
  maxBytes?: number;
  /**
   * Extra request headers.
   */
  headers?: Record<string, string>;
  /**
   * Prepend a Markdown header (`# Title` + `_Source: URL_`) to the output.
   * Defaults to `true`.
   */
  includeHeader?: boolean;
}

export interface FetchedDocument {
  /** The originally requested URL. */
  url: string;
  /** The final URL after any redirects. */
  finalUrl: string;
  /** The decoded HTML source. */
  html: string;
  /** The response `Content-Type` (without charset). */
  contentType: string;
}

export interface ExtractedContent {
  /** Page title, from `<title>` or an Open Graph `og:title`. */
  title: string;
  /** Publication date, from `article:published_time` / `date` meta tags. */
  publishedAt?: string;
  /** Author, from `author` / `article:author` meta tags. */
  author?: string;
  /** The extracted main-content subtree as HTML. */
  html: string;
  /** The base URL used to resolve relative links. */
  baseUrl: string;
}

export interface ToMdResult {
  /** Page title. */
  title: string;
  /** The final Markdown (including the header when enabled). */
  markdown: string;
  /** Final URL of the fetched page. */
  sourceUrl: string;
  /** Number of characters in `markdown`. */
  charCount: number;
  /** Estimated token count (characters / 4). */
  tokenEstimate: number;
  /** Whether the output was truncated by a limit. */
  truncated: boolean;
}
