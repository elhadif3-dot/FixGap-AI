import { queryReviewsByExample } from "@/lib/pineconeReviews";
import type { Review } from "@/lib/types";
import { estimateTokens, GUEST_REVIEW_TOKEN_BUDGET, sourcePassages } from "@/lib/guestEvidenceBudget";

const hintPatterns = {
  strengths: /comfortable|helpful|renovat|spotless|welcoming|well equipped|great location|excellent/i,
  drawbacks: /noise|noisy|stairs|dirty|broken|uncomfortable|problem|difficult|small|cold|hot|poor/i,
  mixed: /\bbut\b|however|although|unfortunately|despite|on the other hand/i
};

export function cleanGuestReviews(reviews: Review[]): Review[] {
  const ids = new Set<string>();
  const texts = new Set<string>();
  return reviews.flatMap((review) => {
    const comments = review.comments.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const key = comments.toLowerCase();
    if (!review.id || comments.length < 35 || ids.has(review.id) || texts.has(key)
      || /this review has been removed|automated posting/i.test(comments)) return [];
    ids.add(review.id); texts.add(key);
    return [{ ...review, comments }];
  });
}

export function selectReviewAnchors(reviews: Review[]) {
  const ordered = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const anchors: Array<{ goal: string; review: Review }> = [];
  const add = (goal: string, candidates: Review[]) => {
    const picked = candidates.find((review) => !anchors.some((anchor) => anchor.review.id === review.id));
    if (picked) anchors.push({ goal, review: picked });
  };
  // These hints diversify search examples; only the semantic analyst determines findings.
  for (const [goal, pattern] of Object.entries(hintPatterns)) {
    add(goal, ordered.filter((review) => pattern.test(review.comments)));
  }
  add("broad_discovery", ordered.filter((review) => review.comments.length > 180));
  add("historical_discovery", [...ordered].reverse().filter((review) => review.comments.length > 180));
  return anchors;
}

export async function retrieveOwnerExampleEvidence(listingId: string, rawReviews: Review[]) {
  const clean = cleanGuestReviews(rawReviews.filter((review) => review.listingId === listingId));
  if (!clean.length) throw new Error("No usable guest reviews are available for this property.");
  const anchors = selectReviewAnchors(clean);
  const pool = new Map<string, Review>();
  const groups: Review[][] = [];
  const searches: Array<{ goal: string; anchor_review_id: string; returned: number }> = [];
  for (const anchor of anchors) {
    const matches = await queryReviewsByExample({ listingId, reviewId: anchor.review.id, topK: 16 });
    matches.forEach((review) => pool.set(review.id, review));
    groups.push(cleanGuestReviews(matches));
    searches.push({ goal: anchor.goal, anchor_review_id: anchor.review.id, returned: matches.length });
  }
  const retrieved = cleanGuestReviews([...pool.values()]);
  const selected = new Map<string, Review>();
  // Mix query groups with time-diverse source samples; selection is not a prevalence estimate.
  anchors.forEach((anchor) => selected.set(anchor.review.id, anchor.review));
  const recent = [...clean].sort((a, b) => b.date.localeCompare(a.date));
  const diverse = Array.from({ length: Math.min(10, recent.length) }, (_, i) => recent[Math.floor(i * recent.length / Math.min(10, recent.length))]);
  diverse.forEach((review) => selected.set(review.id, review));
  for (let rank = 0; rank < 16 && selected.size < 45; rank += 1) {
    for (const group of groups) {
      const review = group[rank];
      if (review && selected.size < 45) selected.set(review.id, review);
    }
  }
  let characters = 0;
  const evidence = [...selected.values()].flatMap((review, index) => {
    if (characters >= 24_000) return [];
    const text = review.comments.slice(0, Math.min(1500, 24_000 - characters));
    if (text.length < 35) return [];
    characters += text.length;
    return [{ id: `r${index + 1}`, review_id: review.id, listing_id: review.listingId, date: review.date,
      text, is_excerpt: text.length < review.comments.length }];
  });
  return {
    evidence,
    audit: { source: "pinecone_by_example", raw_count: rawReviews.length, clean_count: clean.length,
      retrieved_unique_count: retrieved.length, analyst_review_count: evidence.length, characters, searches,
      coverage_note: "Selected semantic neighbors and diverse source samples, not exhaustive or representative coverage.",
      embedding_note: "Queries reuse existing indexed vectors; no new embeddings or index writes." }
  };
}

export async function retrieveGuestEvidence(listingId: string, rawReviews: Review[], options: { windowIndex?: number; evidenceOffset?: number } = {}) {
  const clean = cleanGuestReviews(rawReviews.filter((review) => review.listingId === listingId))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (!clean.length) throw new Error("No usable guest reviews are available for this property.");
  const windowIndex = options.windowIndex ?? 0;
  if (!Number.isInteger(windowIndex) || windowIndex < 0) throw new Error("Invalid source window index.");
  const window = clean.slice(windowIndex * 200, (windowIndex + 1) * 200);
  if (!window.length) throw new Error("No more source windows are available.");
  const byId = new Map(window.map((review) => [review.id, review]));
  const anchors = selectReviewAnchors(window);
  if (!anchors.some((anchor) => anchor.goal === "broad_discovery")) {
    anchors.push({ goal: "broad_discovery", review: window[0] });
  }
  const groups: Review[][] = [];
  const searches: Array<{ goal: string; anchor_review_id: string; returned: number }> = [];
  const retrievedIds = new Set<string>();
  for (const anchor of anchors) {
    const matches = await queryReviewsByExample({ listingId, reviewId: anchor.review.id,
      reviewIds: [...byId.keys()], topK: 40 });
    const eligible = matches.flatMap((review) => {
      const source = byId.get(review.id);
      if (!source || review.listingId !== listingId) return [];
      retrievedIds.add(source.id);
      return [source];
    });
    groups.push(eligible);
    searches.push({ goal: anchor.goal, anchor_review_id: anchor.review.id, returned: eligible.length });
  }
  const candidates = new Map<string, Review>();
  anchors.forEach(({ review }) => candidates.set(review.id, review));
  for (let i = 0; i < Math.min(5, window.length); i++) {
    const review = window[Math.floor(i * window.length / Math.min(5, window.length))];
    candidates.set(review.id, review);
  }
  // Semantic neighbors are interleaved across goals, rather than all coming from one search.
  for (let rank = 0; rank < 40; rank++) {
    for (const group of groups) if (group[rank]) candidates.set(group[rank].id, group[rank]);
  }
  // Unretrieved window records remain candidates, without being called semantic matches.
  window.forEach((review) => candidates.set(review.id, review));
  const evidence: Array<{ id: string; review_id: string; listing_id: string; date: string;
    text: string; passages: string[]; is_excerpt: boolean }> = [];
  for (const review of candidates.values()) {
    const passages = sourcePassages(review.comments, 140);
    if (!passages.length) continue;
    const item = { id: `r${(options.evidenceOffset ?? 0) + evidence.length + 1}`, review_id: review.id, listing_id: listingId,
      date: review.date, text: passages.join("\n[...]\n"), passages,
      is_excerpt: passages.length !== 1 || passages[0] !== review.comments };
    const wire = [...evidence, item].map(({ text: _text, ...record }) => record);
    if (estimateTokens(wire) <= GUEST_REVIEW_TOKEN_BUDGET) evidence.push(item);
  }
  if (!evidence.length) throw new Error("The review evidence budget could not fit any usable sources.");
  const tokens = estimateTokens(evidence.map(({ text: _text, ...record }) => record));
  return { evidence, sourceWindow: window, audit: {
    source: "pinecone_by_example", raw_count: rawReviews.length, clean_count: clean.length,
    source_window_size: 200, source_window_count: window.length, source_window_index: windowIndex,
    source_window_order: "newest_first", source_windows_visited: windowIndex + 1,
    source_reviews_in_visited_windows: Math.min((windowIndex + 1) * 200, clean.length),
    source_window_date_from: window.at(-1)?.date, source_window_date_to: window[0]?.date,
    remaining_source_reviews: Math.max(0, clean.length - (windowIndex + 1) * 200),
    retrieved_unique_count: retrievedIds.size, candidate_count: candidates.size,
    analyst_review_count: evidence.length, analyst_passage_count: evidence.reduce((sum, item) => sum + item.passages.length, 0),
    evidence_token_budget: GUEST_REVIEW_TOKEN_BUDGET, estimated_evidence_tokens: tokens,
    token_measurement: "UTF-8 heuristic estimate, not the provider tokenizer; actual usage is reported per model call.",
    characters: evidence.reduce((sum, item) => sum + item.passages.join("").length, 0), searches,
    coverage_note: "Source window of up to 200 newest usable reviews. Only selected passages reach the analyst; neither exhaustive semantic analysis of the window nor representative coverage of all guests.",
    passage_note: "Semantic retrieval ranks whole reviews. Intact source sentences sample opening/closing context; code does not label these passages as semantic signals.",
    embedding_note: "Queries reuse existing indexed vectors within the source window; no new embeddings or index writes."
  } };
}
