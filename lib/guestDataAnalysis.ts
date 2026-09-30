import type { Listing, Place, Review } from "@/lib/types";

export type TopicMetric = {
  id: string;
  label: string;
  positiveReviews: number;
  negativeReviews: number;
  mentionedReviews: number;
  prevalencePct: number;
  positiveSharePct: number | null;
};

export type RecurringIssue = {
  topicId: string;
  label: string;
  negativeReviews: number;
  prevalencePct: number;
  activeMonths: number;
  monthsWithIssue: number;
  recurrenceScore: number;
  confidence: "high" | "medium" | "low";
};

export type TrendMetric = {
  topicId: string;
  label: string;
  polarity: "positive" | "negative";
  recentCount: number;
  historicalCount: number;
  recentRatePct: number;
  historicalRatePct: number;
  changePoints: number;
  direction: "improving" | "worsening" | "stable";
};

export type ExpectationMetric = {
  topicId: string;
  label: string;
  listingSignal: "explicit" | "not stated";
  guestEvidence: string;
  result: "supported" | "possible_gap" | "unmentioned_strength" | "insufficient";
};

export type GuestDataAnalysis = {
  version: "guest-data-lab-v1";
  listing: { id: string; name: string };
  coverage: {
    reviewsAvailable: number;
    reviewsAnalyzed: number;
    reviewsWithSignals: number;
    dateFrom: string | null;
    dateTo: string | null;
    recentReviews: number;
    historicalReviews: number;
    scope: "full_source_corpus";
  };
  topics: TopicMetric[];
  recurringIssues: RecurringIssue[];
  trends: TrendMetric[];
  expectations: ExpectationMetric[];
  nearby: {
    radiusKm: 1;
    placeCount: number;
    categories: Array<{ category: string; count: number; within500m: number; weightedRating: number | null }>;
    topPlaces: Array<{ name: string; category: string; rating: number | null; reviews: number; distanceKm: number }>;
  };
  insights: string[];
  methodology: {
    topicMethod: string;
    recurrenceFormula: string;
    trendMethod: string;
    limitations: string[];
  };
};

export type TopicDefinition = {
  id: string;
  label: string;
  positive: RegExp;
  negative: RegExp;
  listingClaim: RegExp;
};

export const REVIEW_SIGNAL_TOPICS: TopicDefinition[] = [
  { id: "location", label: "Location & walkability",
    positive: /great location|perfect location|excellent location|central location|well located|prime location|heart of|walking distance|walkable|close to|bem localiz|boa localiza|excelente localiza|buena ubicaci|excelente ubicaci|bien situ|idealement situ|ottima posizion|zentral gelegen/,
    negative: /far from|poor location|bad location|inconvenient location|too touristy|difficult to reach|hard to reach/,
    listingClaim: /location|located|heart of|walk|close|near|center|centre|bairro|rossio/ },
  { id: "cleanliness", label: "Cleanliness",
    positive: /very clean|spotless|immaculate|clean and|clean room|clean hotel|well kept|propre|limp[oa]|pulit[oa]|sauber/,
    negative: /not clean|unclean|dirty|filthy|dusty|mould|mold|stain|sale chambre|suc[io]|sporco|schmutzig/,
    listingClaim: /clean|spotless|immaculate|well kept/ },
  { id: "noise", label: "Noise & quiet",
    positive: /quiet|peaceful|silent|calm room|tranquil|no noise|no issue.*noise|noise.*not.*issue|silencios|calme|tranquille|ruhig|silenzios/,
    negative: /street noise|noise at night|noise from|noise was|noise level|a lot of noise|some noise|too much noise|very noisy|too noisy|noisy|loud|bruit|bruyant|barulho|ruido|ruidos|laut|rumore/,
    listingClaim: /quiet|peaceful|calm|soundproof|tranquil/ },
  { id: "service", label: "Staff & service",
    positive: /helpful staff|friendly staff|kind staff|attentive staff|helpful reception|friendly reception|great host|wonderful host|hospitality|accommodating|prestativ|simpatic|amable|gentil|serviable|freundlich/,
    negative: /rude staff|unhelpful staff|unfriendly staff|poor service|bad service|rude reception|staff.*not helpful|host.*unresponsive/,
    listingClaim: /staff|host|reception|service|hospitality|building staff/ },
  { id: "checkin", label: "Arrival & check-in",
    positive: /easy check.?in|smooth check.?in|flexible check.?in|early check.?in|self check.?in|leave.*luggage|left.*luggage|hold.*luggage|stored.*luggage/,
    negative: /difficult check.?in|check.?in problem|check.?in issue|wait.*check.?in|late check.?in|key problem|could not check/,
    listingClaim: /check.?in|arrival|luggage|self check/ },
  { id: "comfort", label: "Comfort & bed",
    positive: /very comfortable|comfortable bed|comfy bed|comfortable room|comfy room|cozy|cosy|confortavel|confortable|comodo|comod[oa]|bequem/,
    negative: /uncomfortable|hard bed|bad mattress|poor mattress|bed.*too hard|bed.*too soft|bad pillow|uncomfy/,
    listingClaim: /comfort|comfortable|cozy|cosy|bed/ },
  { id: "wifi", label: "Wi-Fi",
    positive: /fast wi.?fi|good wi.?fi|great wi.?fi|reliable wi.?fi|strong wi.?fi|fast internet|good internet/,
    negative: /wi.?fi.*not work|no wi.?fi|poor wi.?fi|slow wi.?fi|weak wi.?fi|internet.*not work|bad internet|slow internet/,
    listingClaim: /wi.?fi|internet/ },
  { id: "accuracy", label: "Listing accuracy",
    positive: /exactly as described|as advertised|matches.*photo|as pictured|accurate description/,
    negative: /not as described|not as pictured|different.*photo|misleading|room.*not.*picture|wasn.t.*picture/,
    listingClaim: /description|photo|pictured|exactly/ },
  { id: "value", label: "Value",
    positive: /good value|great value|excellent value|value for money|worth the price|worth it|great deal|price.*awesome|bom custo|buena relacion calidad/,
    negative: /overpriced|not worth|poor value|bad value|too expensive|expensive for/,
    listingClaim: /value|price|affordable|deal|budget/ },
  { id: "property_quality", label: "Room quality",
    positive: /new suite|new room|newly renovated|recently renovated|renovated|refurbished|modern room|modern amenities|fresh room|boutique feel|well equipped/,
    negative: /outdated|run down|worn out|old furniture|broken|needs renovation|damp|poor condition/,
    listingClaim: /renovated|refurbished|modern|new|boutique|well equipped/ },
  { id: "safety", label: "Safety",
    positive: /felt safe|very safe|safe area|safe hotel|secure building|peaceful and safe/,
    negative: /felt unsafe|unsafe area|not safe|security issue|dangerous/,
    listingClaim: /safe|secure|security|camera/ }
];

export type PreparedReview = Review & { normalized: string; timestamp: number; month: string; signals: Map<string, Set<"positive" | "negative">> };

export function analyzeGuestData(listing: Listing, rawReviews: Review[], places: Place[]): GuestDataAnalysis {
  const reviews = prepareReviews(rawReviews);
  const dated = reviews.filter((review) => Number.isFinite(review.timestamp)).sort((a, b) => b.timestamp - a.timestamp);
  const recentSize = dated.length < 40 ? Math.floor(dated.length / 2) : Math.max(20, Math.round(dated.length * 0.25));
  const recent = new Set(dated.slice(0, recentSize).map((review) => review.id));
  const historical = new Set(dated.slice(recentSize).map((review) => review.id));
  const denominator = reviews.length || 1;
  const topics = REVIEW_SIGNAL_TOPICS.map((topic) => topicMetric(topic, reviews, denominator))
    .filter((topic) => topic.mentionedReviews > 0)
    .sort((a, b) => b.mentionedReviews - a.mentionedReviews || a.label.localeCompare(b.label));
  const activeMonths = new Set(reviews.filter((review) => review.month).map((review) => review.month)).size;
  const minRecurring = Math.max(2, Math.ceil(reviews.length * 0.002));
  const recurringIssues = topics.filter((topic) => topic.negativeReviews >= minRecurring).map((topic) => {
    const matching = reviews.filter((review) => review.signals.get(topic.id)?.has("negative"));
    const monthsWithIssue = new Set(matching.map((review) => review.month).filter(Boolean)).size;
    const frequencyComponent = Math.min(1, topic.negativeReviews / Math.max(3, reviews.length * 0.05));
    const consistencyComponent = activeMonths ? monthsWithIssue / activeMonths : 0;
    const timestamps = matching.map((review) => review.timestamp).filter(Number.isFinite);
    const minTime = dated.at(-1)?.timestamp ?? 0;
    const maxTime = dated[0]?.timestamp ?? minTime;
    const recencyComponent = timestamps.length && maxTime > minTime
      ? timestamps.reduce((sum, time) => sum + (time - minTime) / (maxTime - minTime), 0) / timestamps.length : 0.5;
    const recurrenceScore = Math.round(100 * (0.5 * frequencyComponent + 0.3 * consistencyComponent + 0.2 * recencyComponent));
    return { topicId: topic.id, label: topic.label, negativeReviews: topic.negativeReviews,
      prevalencePct: pct(topic.negativeReviews, denominator), activeMonths, monthsWithIssue, recurrenceScore,
      confidence: topic.negativeReviews >= 10 ? "high" as const : topic.negativeReviews >= 4 ? "medium" as const : "low" as const };
  }).sort((a, b) => b.recurrenceScore - a.recurrenceScore).slice(0, 6);
  const trends = buildTrends(topics, reviews, recent, historical).slice(0, 6);
  const normalizedListingContent = normalize(`${listing.description} ${listing.amenities.join(" ")}`);
  const expectations = topics.map((topic) => expectationMetric(topic, normalizedListingContent, reviews.length))
    .filter((metric) => metric.result !== "insufficient" || metric.listingSignal === "explicit")
    .sort((a, b) => expectationOrder(a.result) - expectationOrder(b.result)).slice(0, 8);
  const nearby = nearbyProfile(places);
  const reviewsWithSignals = reviews.filter((review) => review.signals.size > 0).length;
  const coverage = { reviewsAvailable: rawReviews.length, reviewsAnalyzed: reviews.length, reviewsWithSignals,
    dateFrom: dated.at(-1)?.date ?? null, dateTo: dated[0]?.date ?? null,
    recentReviews: recent.size, historicalReviews: historical.size, scope: "full_source_corpus" as const };
  const result: GuestDataAnalysis = {
    version: "guest-data-lab-v1", listing: { id: listing.id, name: listing.name }, coverage,
    topics, recurringIssues, trends, expectations, nearby,
    insights: [],
    methodology: {
      topicMethod: "Every cleaned source review is scanned once with an explainable multilingual phrase lexicon. Counts are unique reviews, not keyword hits.",
      recurrenceFormula: "Score = 50% frequency (capped at a 5% complaint rate) + 30% month consistency + 20% time recency.",
      trendMethod: "The newest 25% of dated reviews (minimum 20) are compared with the older baseline using per-review signal rates.",
      limitations: [
        "Phrase rules are reproducible but can miss indirect wording, sarcasm, or unsupported languages.",
        "A review can mention more than one topic, so topic percentages do not sum to 100%.",
        "Nearby metrics describe the cached local Google Places dataset, not live opening hours or walking routes."
      ]
    }
  };
  result.insights = buildInsights(result);
  return result;
}

export function prepareReviews(raw: Review[]): PreparedReview[] {
  const ids = new Set<string>();
  const texts = new Set<string>();
  return raw.flatMap((review) => {
    const normalized = normalize(review.comments);
    if (!review.id || normalized.length < 20 || ids.has(review.id) || texts.has(normalized)
      || /this review has been removed|automated posting/.test(normalized)) return [];
    ids.add(review.id); texts.add(normalized);
    const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(review.date) ? Date.parse(`${review.date}T00:00:00Z`) : Number.NaN;
    const signals = new Map<string, Set<"positive" | "negative">>();
    for (const topic of REVIEW_SIGNAL_TOPICS) {
      const polarities = new Set<"positive" | "negative">();
      if (topic.positive.test(normalized)) polarities.add("positive");
      if (topic.negative.test(normalized)) polarities.add("negative");
      if (polarities.size) signals.set(topic.id, polarities);
    }
    return [{ ...review, normalized, timestamp, month: Number.isFinite(timestamp) ? review.date.slice(0, 7) : "", signals }];
  });
}

function topicMetric(topic: TopicDefinition, reviews: PreparedReview[], denominator: number): TopicMetric {
  const positiveReviews = reviews.filter((review) => review.signals.get(topic.id)?.has("positive")).length;
  const negativeReviews = reviews.filter((review) => review.signals.get(topic.id)?.has("negative")).length;
  const mentionedReviews = reviews.filter((review) => review.signals.has(topic.id)).length;
  return { id: topic.id, label: topic.label, positiveReviews, negativeReviews, mentionedReviews,
    prevalencePct: pct(mentionedReviews, denominator),
    positiveSharePct: mentionedReviews ? pct(positiveReviews, positiveReviews + negativeReviews) : null };
}

function buildTrends(topics: TopicMetric[], reviews: PreparedReview[], recent: Set<string>, historical: Set<string>): TrendMetric[] {
  if (!recent.size || !historical.size) return [];
  return topics.flatMap((topic) => (["positive", "negative"] as const).flatMap((polarity) => {
    const recentCount = reviews.filter((review) => recent.has(review.id) && review.signals.get(topic.id)?.has(polarity)).length;
    const historicalCount = reviews.filter((review) => historical.has(review.id) && review.signals.get(topic.id)?.has(polarity)).length;
    if (recentCount + historicalCount < 3) return [];
    const recentRatePct = pct(recentCount, recent.size);
    const historicalRatePct = pct(historicalCount, historical.size);
    const changePoints = round(recentRatePct - historicalRatePct, 1);
    const improving = polarity === "positive" ? changePoints > 1 : changePoints < -1;
    const worsening = polarity === "positive" ? changePoints < -1 : changePoints > 1;
    return [{ topicId: topic.id, label: topic.label, polarity, recentCount, historicalCount,
      recentRatePct, historicalRatePct, changePoints,
      direction: improving ? "improving" as const : worsening ? "worsening" as const : "stable" as const }];
  })).sort((a, b) => Math.abs(b.changePoints) - Math.abs(a.changePoints));
}

function expectationMetric(topic: TopicMetric, description: string, analyzed: number): ExpectationMetric {
  const definition = REVIEW_SIGNAL_TOPICS.find((item) => item.id === topic.id)!;
  const explicit = definition.listingClaim.test(description);
  const minimum = Math.max(3, Math.ceil(analyzed * 0.005));
  const positive = topic.positiveReviews;
  const negative = topic.negativeReviews;
  let result: ExpectationMetric["result"] = "insufficient";
  if (explicit && negative >= minimum && negative > positive * 0.35) result = "possible_gap";
  else if (explicit && positive >= minimum && positive >= negative) result = "supported";
  else if (!explicit && positive >= minimum && positive > negative * 1.5) result = "unmentioned_strength";
  const guestEvidence = `${positive} positive / ${negative} negative review signals`;
  return { topicId: topic.id, label: topic.label, listingSignal: explicit ? "explicit" : "not stated", guestEvidence, result };
}

function nearbyProfile(places: Place[]): GuestDataAnalysis["nearby"] {
  const seenPlaces = new Set<string>();
  const eligible = places.filter((place) => {
    const key = `${normalize(place.placeName)}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`;
    if (seenPlaces.has(key) || !Number.isFinite(place.distanceKm) || (place.distanceKm ?? 2) > 1) return false;
    seenPlaces.add(key);
    return true;
  });
  const groups = new Map<string, Place[]>();
  eligible.forEach((place) => groups.set(place.category, [...(groups.get(place.category) ?? []), place]));
  const categories = [...groups].map(([category, items]) => {
    const rated = items.filter((item) => item.rating !== null && item.numberOfReviews > 0);
    const weight = rated.reduce((sum, item) => sum + Math.log10(item.numberOfReviews + 1), 0);
    const weightedRating = weight ? rated.reduce((sum, item) => sum + (item.rating ?? 0) * Math.log10(item.numberOfReviews + 1), 0) / weight : null;
    return { category, count: items.length, within500m: items.filter((item) => (item.distanceKm ?? 2) <= 0.5).length,
      weightedRating: weightedRating === null ? null : round(weightedRating, 2) };
  }).sort((a, b) => b.count - a.count);
  const topPlaces = [...eligible].filter((place) => place.rating !== null && place.numberOfReviews >= 10)
    .sort((a, b) => placeScore(b) - placeScore(a)).slice(0, 6).map((place) => ({
      name: place.placeName, category: place.category, rating: place.rating, reviews: place.numberOfReviews,
      distanceKm: round(place.distanceKm ?? 0, 2)
    }));
  return { radiusKm: 1, placeCount: eligible.length, categories, topPlaces };
}

function placeScore(place: Place): number {
  return (place.rating ?? 0) * Math.log10(place.numberOfReviews + 1) / (1 + (place.distanceKm ?? 1));
}

function buildInsights(result: GuestDataAnalysis): string[] {
  const insights: string[] = [];
  const strongest = result.topics[0];
  if (strongest) insights.push(`${strongest.label} is the most frequently detected experience topic: ${strongest.mentionedReviews} of ${result.coverage.reviewsAnalyzed} analyzed reviews (${strongest.prevalencePct}%).`);
  const issue = result.recurringIssues[0];
  if (issue) insights.push(`${issue.label} is the strongest recurring issue (${issue.recurrenceScore}/100): ${issue.negativeReviews} reviews across ${issue.monthsWithIssue} active months.`);
  const trend = result.trends.find((item) => item.direction !== "stable") ?? result.trends[0];
  if (trend) insights.push(`${trend.label} ${trend.polarity} signals are ${Math.abs(trend.changePoints)} percentage points ${trend.changePoints >= 0 ? "higher" : "lower"} in the recent cohort (${trend.recentRatePct}% vs ${trend.historicalRatePct}%).`);
  const gap = result.expectations.find((item) => item.result === "possible_gap")
    ?? result.expectations.find((item) => item.result === "unmentioned_strength");
  if (gap) insights.push(gap.result === "possible_gap"
    ? `${gap.label} is a possible expectation gap: the listing states it explicitly while guest evidence includes repeated negative signals.`
    : `${gap.label} is a data-backed strength that is not stated explicitly in the listing description.`);
  const category = result.nearby.categories[0];
  if (category) insights.push(`${category.category} is the densest nearby category: ${category.count} cached places within 1 km, including ${category.within500m} within 500 m.`);
  return insights.slice(0, 4);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function expectationOrder(value: ExpectationMetric["result"]): number {
  return ({ possible_gap: 0, unmentioned_strength: 1, supported: 2, insufficient: 3 })[value];
}

function pct(value: number, total: number): number {
  return total ? round(value / total * 100, 1) : 0;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
