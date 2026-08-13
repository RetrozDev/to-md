/** Rough token estimate: ~4 characters per token for English text. */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
}

/**
 * Truncate a Markdown string at the closest preceding blank line so headings
 * and paragraphs stay intact.
 */
function cutAtBoundary(text: string, max: number): TruncationResult {
  if (text.length <= max) return { text, truncated: false };

  let cut = max;
  const boundary = text.lastIndexOf("\n\n", max);
  if (boundary > 0) cut = boundary;
  else {
    const nl = text.lastIndexOf("\n", max);
    if (nl > 0) cut = nl;
  }
  return {
    text: text.slice(0, cut).trimEnd(),
    truncated: true,
  };
}

export function truncateByChars(text: string, maxChars: number): TruncationResult {
  return cutAtBoundary(text, maxChars);
}

export function truncateByTokens(text: string, maxTokens: number): TruncationResult {
  return cutAtBoundary(text, maxTokens * CHARS_PER_TOKEN);
}
