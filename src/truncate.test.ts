import { describe, expect, it } from "vitest";
import {
  CHARS_PER_TOKEN,
  estimateTokens,
  truncateByChars,
  truncateByTokens,
} from "./truncate.js";

describe("estimateTokens", () => {
  it("approximates tokens as chars / 4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});

describe("truncateByChars", () => {
  it("returns the text unchanged when under the limit", () => {
    const text = "short";
    expect(truncateByChars(text, 100)).toEqual({ text, truncated: false });
  });

  it("cuts at the nearest paragraph boundary", () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const { text: cut, truncated } = truncateByChars(text, 30);
    expect(truncated).toBe(true);
    expect(cut).toBe("Paragraph one.\n\nParagraph two.");
    expect(cut.length).toBeLessThanOrEqual(30);
  });

  it("falls back to a newline boundary when no blank line exists", () => {
    const text = "Line A\nLine B\nLine C";
    const { text: cut, truncated } = truncateByChars(text, 10);
    expect(truncated).toBe(true);
    expect(cut).toBe("Line A");
  });
});

describe("truncateByTokens", () => {
  it("cuts at a boundary respecting tokens", () => {
    const text = `# Title

Some body text that goes on for a while.

More text here.
`;
    const max = 2;
    const { text: cut, truncated } = truncateByTokens(text, max);
    expect(truncated).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(max * CHARS_PER_TOKEN + 2);
  });
});
