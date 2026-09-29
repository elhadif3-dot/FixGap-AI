import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  new Function("require", "module", "exports", output)(require, module, module.exports);
  return module.exports;
}

const { analyzeGuestData } = load("lib/guestDataAnalysis.ts");
const { parseCsv, rowsToObjects } = load("lib/csv.ts");
const listing = {
  id: "1", name: "Test stay", description: "A central walkable apartment with Wifi.", neighbourhood: "Center",
  latitude: 38.7, longitude: -9.1, propertyType: "Apartment", roomType: "Entire place", accommodates: 2,
  bathroomsText: "1 bath", bedrooms: 1, beds: 1, amenities: ["Wifi"], price: "$100", reviewScore: 4.5,
  locationScore: 4.8, valueScore: 4.4, numberOfReviews: 8, nearbyPlacesCount: 2
};
const review = (id, date, comments) => ({ listingId: "1", id, date, comments });
const reviews = [
  review("1", "2024-01-01", "Great location and very easy walking distance to the center."),
  review("2", "2024-02-01", "Perfect location, walkable and close to everything."),
  review("3", "2024-03-01", "Excellent central location and a clean room."),
  review("4", "2024-04-01", "The street noise at night made sleeping difficult."),
  review("5", "2024-05-01", "The room was very noisy because of loud nightlife."),
  review("6", "2024-06-01", "There was some noise from the street after midnight."),
  review("7", "2024-07-01", "Despite the central area I had no issue with noise."),
  review("8", "2024-08-01", "Despite the central area I had no issue with noise."),
  review("9", "2024-09-01", "Short")
];
const places = [
  { placeName: "Cafe", category: "Dining", rating: 4.8, numberOfReviews: 100, reviewsContent: "", latitude: 0, longitude: 0, distanceKm: 0.2 },
  { placeName: "Museum", category: "Culture", rating: 4.7, numberOfReviews: 80, reviewsContent: "", latitude: 0, longitude: 0, distanceKm: 0.7 }
];

const result = analyzeGuestData(listing, reviews, places);
assert.equal(result.coverage.reviewsAvailable, 9);
assert.equal(result.coverage.reviewsAnalyzed, 7, "Duplicate text and short rows should be removed.");
const noise = result.topics.find((topic) => topic.id === "noise");
assert.equal(noise.negativeReviews, 3, "Explicit noise complaints should be counted once per review.");
assert.equal(noise.positiveReviews, 1, "No-issue noise wording must not be classified as a complaint.");
assert.equal(result.recurringIssues[0].topicId, "noise");
assert.ok(result.recurringIssues[0].recurrenceScore > 0 && result.recurringIssues[0].recurrenceScore <= 100);
assert.equal(result.expectations.find((item) => item.topicId === "location").result, "supported");
assert.equal(result.nearby.placeCount, 2);
assert.equal(result.nearby.categories.reduce((sum, item) => sum + item.count, 0), 2);
assert.equal(result.version, "guest-data-lab-v1");
console.log("PASS: Guest Data Lab cleaning, topic polarity, recurrence, expectation alignment and nearby aggregation.");

const sourceRows = rowsToObjects(parseCsv(readFileSync("data/lisbon_reviews_final_with_pois.csv", "utf8")));
for (const listingId of ["45855270", "4132059", "10402101"]) {
  const raw = sourceRows.filter((row) => row.listing_id === listingId && row.id && row.comments).map((row) => ({
    listingId, id: row.id, date: row.date,
    comments: row.comments.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  }));
  const ids = new Set(); const texts = new Set();
  const independentlyCleaned = raw.filter((item) => {
    const normalized = item.comments.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, " ")
      .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (normalized.length < 20 || ids.has(item.id) || texts.has(normalized)
      || /this review has been removed|automated posting/.test(normalized)) return false;
    ids.add(item.id); texts.add(normalized); return true;
  });
  const real = analyzeGuestData({ ...listing, id: listingId, name: listingId }, raw, []);
  assert.equal(real.coverage.reviewsAvailable, raw.length);
  assert.equal(real.coverage.reviewsAnalyzed, independentlyCleaned.length);
  assert.ok(real.coverage.reviewsWithSignals <= real.coverage.reviewsAnalyzed);
  assert.equal(new Set(real.topics.map((topic) => topic.id)).size, real.topics.length);
  for (const topic of real.topics) {
    assert.ok(topic.mentionedReviews >= Math.max(topic.positiveReviews, topic.negativeReviews));
    assert.ok(topic.mentionedReviews <= topic.positiveReviews + topic.negativeReviews);
    assert.equal(topic.prevalencePct, Math.round(topic.mentionedReviews / real.coverage.reviewsAnalyzed * 1000) / 10);
  }
  for (const issue of real.recurringIssues) {
    assert.equal(issue.negativeReviews, real.topics.find((topic) => topic.id === issue.topicId)?.negativeReviews);
    assert.ok(issue.recurrenceScore >= 0 && issue.recurrenceScore <= 100);
  }
  assert.equal(real.coverage.recentReviews + real.coverage.historicalReviews, real.coverage.reviewsAnalyzed);
}
console.log("PASS: real-corpus row counts, independent cleaning totals, denominators and metric invariants for three listings.");
