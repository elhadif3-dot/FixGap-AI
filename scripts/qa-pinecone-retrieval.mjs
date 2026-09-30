import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";
import { parseCsv, rowsToObjects } from "./csv.mjs";
import { loadLocalEnv, pineconeReviewIndexName, pineconeReviewNamespace, requireEnv } from "./env.mjs";

loadLocalEnv();
assert.equal(process.env.FIXGAP_LOCAL_ONLY, "true", "Live retrieval QA is allowed only with FIXGAP_LOCAL_ONLY=true.");

const cleanText = (value) => String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const rows = rowsToObjects(parseCsv(await readFile(path.join(process.cwd(), "data", "lisbon_reviews_final_with_pois.csv"), "utf8")))
  .filter((row) => row.listing_id && row.id && cleanText(row.comments).length >= 35);
const byListing = new Map();
for (const row of rows) {
  const text = cleanText(row.comments);
  const list = byListing.get(row.listing_id) ?? [];
  if (!list.some((item) => item.id === row.id || item.text.toLowerCase() === text.toLowerCase())) {
    list.push({ id: row.id, date: row.date, text });
    byListing.set(row.listing_id, list);
  }
}
for (const reviews of byListing.values()) reviews.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

let localWindows = 0;
for (const [listingId, reviews] of byListing) {
  assert.equal(new Set(reviews.map((review) => review.id)).size, reviews.length, `Duplicate source IDs for ${listingId}.`);
  const windows = Array.from({ length: Math.ceil(reviews.length / 200) }, (_, index) => reviews.slice(index * 200, (index + 1) * 200));
  localWindows += windows.length;
  assert.ok(windows.every((window) => window.length > 0 && window.length <= 200), `Invalid window size for ${listingId}.`);
  const flattened = windows.flat();
  assert.deepEqual(flattened.map((review) => review.id), reviews.map((review) => review.id), `Window loss or reordering for ${listingId}.`);
  assert.equal(new Set(flattened.map((review) => review.id)).size, reviews.length, `Overlapping windows for ${listingId}.`);
  for (let index = 1; index < flattened.length; index += 1) {
    assert.ok(flattened[index - 1].date.localeCompare(flattened[index].date) >= 0, `Date order broke for ${listingId}.`);
  }
}

const topicPatterns = {
  location: /great location|perfect location|central location|walking distance|walkable|close to|well located/i,
  cleanliness: /clean|spotless|dirty|filthy|mould|mold/i,
  noise: /quiet|noise|noisy|loud|street noise/i,
  service: /helpful|friendly|staff|reception|host/i,
  comfort: /comfortable|comfy|uncomfortable|bed|mattress/i
};
const topics = (text) => Object.entries(topicPatterns).filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
const selectAnchors = (window) => {
  const selected = new Map();
  for (const topic of Object.keys(topicPatterns)) {
    const match = window.find((review) => topics(review.text).includes(topic) && review.text.length >= 55);
    if (match) selected.set(match.id, { ...match, expectedTopic: topic });
    if (selected.size >= 3) break;
  }
  if (selected.size < 3) {
    [...window].sort((a, b) => b.text.length - a.text.length).slice(0, 3 - selected.size)
      .forEach((review) => selected.set(review.id, { ...review, expectedTopic: topics(review.text)[0] ?? null }));
  }
  return [...selected.values()];
};

const pc = new Pinecone({ apiKey: requireEnv("PINECONE_API_KEY") });
const target = pc.index(pineconeReviewIndexName()).namespace(pineconeReviewNamespace());
const listingIds = [...byListing].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([listingId]) => listingId);
const report = [];
let totalQueries = 0;
let totalMatches = 0;
let topicCompared = 0;
let topicMatches = 0;

for (const listingId of listingIds) {
  const source = byListing.get(listingId);
  assert.ok(source?.length >= 400, `Expected a rich local review corpus for ${listingId}.`);
  const sourceById = new Map(source.map((review) => [review.id, review]));
  const windowCount = Math.ceil(source.length / 200);
  const windowIndexes = [...new Set([0, Math.floor((windowCount - 1) / 2), windowCount - 1])];
  for (const windowIndex of windowIndexes) {
    const window = source.slice(windowIndex * 200, (windowIndex + 1) * 200);
    const allowed = new Set(window.map((review) => review.id));
    for (const anchor of selectAnchors(window)) {
      const response = await target.query({
        id: `review-${listingId}-${anchor.id}`,
        topK: Math.min(20, window.length),
        includeMetadata: true,
        filter: { listing_id: { $eq: listingId }, source: { $eq: "airbnb_review" }, review_id: { $in: [...allowed] } }
      });
      const matches = response.matches ?? [];
      totalQueries += 1; totalMatches += matches.length;
      assert.ok(matches.length > 0, `No Pinecone matches for ${listingId}/${anchor.id}.`);
      assert.ok(matches.some((match) => String(match.metadata?.review_id) === anchor.id), "Anchor self-match is missing.");
      assert.equal(new Set(matches.map((match) => match.id)).size, matches.length, "Duplicate vector IDs returned.");
      matches.forEach((match, index) => {
        const metadata = match.metadata;
        const reviewId = String(metadata?.review_id ?? "");
        assert.equal(String(metadata?.listing_id), listingId, "Cross-listing match returned.");
        assert.equal(metadata?.source, "airbnb_review", "Unexpected source metadata.");
        assert.ok(allowed.has(reviewId), "Match escaped the requested 200-review source window.");
        assert.equal(String(metadata?.text), sourceById.get(reviewId)?.text.slice(0, 6000), "Pinecone text differs from local CSV source.");
        if (index > 0) assert.ok(Number(matches[index - 1].score) >= Number(match.score), "Pinecone scores are not descending.");
      });
      if (anchor.expectedTopic) {
        const neighbors = matches.filter((match) => String(match.metadata?.review_id) !== anchor.id).slice(0, 10);
        topicCompared += neighbors.length;
        topicMatches += neighbors.filter((match) => topics(String(match.metadata?.text ?? "")).includes(anchor.expectedTopic)).length;
      }
    }
    report.push({ listing_id: listingId, window_index: windowIndex, window_size: window.length,
      date_from: window.at(-1)?.date, date_to: window[0]?.date });
  }
}

const topicAgreementPct = topicCompared ? Math.round(topicMatches / topicCompared * 1000) / 10 : 0;
assert.ok(topicAgreementPct >= 25, `Topic agreement ${topicAgreementPct}% is below the 25% smoke-test floor.`);
console.log(JSON.stringify({ status: "PASS", mode: "read_only", index: pineconeReviewIndexName(),
  namespace: pineconeReviewNamespace(), source_listings_checked: byListing.size, source_windows_checked: localWindows,
  pinecone_listings: listingIds.length, windows: report,
  queries: totalQueries, matches: totalMatches, topic_agreement_pct: topicAgreementPct,
  assertions: ["all-source window partition", "newest-first order", "source parity", "window isolation",
    "listing isolation", "self-match", "unique IDs", "score order"] }, null, 2));
