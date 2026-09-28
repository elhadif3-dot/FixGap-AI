export const GUEST_REVIEW_TOKEN_BUDGET = 3000;
export const GUEST_INPUT_TOKEN_BUDGET = 6000;

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(new TextEncoder().encode(text).length / 3);
}

export function sourcePassages(text: string, tokenBudget: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (estimateTokens(cleaned) <= tokenBudget) return cleaned ? [cleaned] : [];
  const segments = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(cleaned)]
    .map((item) => item.segment.trim()).filter(Boolean);
  // Sample intact opening and closing context, not keyword-labelled "signals".
  const order = [...new Set([0, segments.length - 1, Math.floor(segments.length / 2)])];
  const selected: Array<{ index: number; text: string }> = [];
  let used = 0;
  for (const index of order) {
    const sentence = segments[index];
    const cost = estimateTokens(sentence);
    if (sentence && used + cost <= tokenBudget) { selected.push({ index, text: sentence }); used += cost; }
  }
  if (selected.length) return selected.sort((a, b) => a.index - b.index).map((item) => item.text);
  // A single very long sentence is explicitly treated as an excerpt, never completed by code.
  let excerpt = cleaned;
  while (estimateTokens(excerpt) > tokenBudget && excerpt.length > 0) {
    excerpt = excerpt.slice(0, Math.floor(excerpt.length * 0.85));
  }
  const boundary = excerpt.lastIndexOf(" ");
  if (boundary > 0) excerpt = excerpt.slice(0, boundary);
  return excerpt.length >= 35 ? [excerpt] : [];
}
