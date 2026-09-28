import type { Review } from "@/lib/types";

export type OwnerReviewSample = { review_id: string; date: string; text: string };
export type OwnerSignalCandidate = {
  topic: string;
  type: string;
  observation: string;
  review_ids: string[];
};

export function sampleOwnerReviewWindow(reviews: Review[], listingId: string): OwnerReviewSample[] {
  const available = reviews.filter((review) => review.listingId === listingId && review.id && review.comments.trim().length >= 45);
  const selected = new Map<string, Review>();
  for (let index = 0; index < Math.min(24, available.length); index += 1) {
    const review = available[Math.floor(index * available.length / Math.min(24, available.length))];
    selected.set(review.id, review);
  }
  for (const review of [...available].sort((a, b) => b.comments.length - a.comments.length)) {
    if (selected.size >= 32) break;
    selected.set(review.id, review);
  }
  return [...selected.values()].map((review) => ({
    review_id: review.id,
    date: review.date,
    text: review.comments.replace(/\s+/g, " ").trim().slice(0, 280)
  }));
}

export function validateOwnerSignalCandidates(
  candidates: OwnerSignalCandidate[], samples: OwnerReviewSample[]
): Array<OwnerSignalCandidate & { evidence: string[] }> {
  const byId = new Map(samples.map((sample) => [sample.review_id, sample]));
  const seenTopics = new Set<string>();
  return candidates.slice(0, 3).flatMap((candidate) => {
    const topic = candidate.topic.trim();
    const ids = [...new Set(candidate.review_ids)];
    const key = topic.toLocaleLowerCase();
    if (!topic || topic.length > 80 || !candidate.observation.trim() || candidate.observation.length > 250 ||
      !["positive_highlight", "accuracy_gap"].includes(candidate.type) ||
      ids.length < 2 || ids.length > 5 || ids.length !== candidate.review_ids.length ||
      ids.some((id) => !byId.has(id)) || seenTopics.has(key)) return [];
    seenTopics.add(key);
    return [{ ...candidate, topic, review_ids: ids,
      evidence: ids.map((id) => `Review ${id}: ${byId.get(id)!.text}`) }];
  });
}
