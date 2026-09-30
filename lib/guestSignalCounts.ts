import { prepareReviews, REVIEW_SIGNAL_TOPICS } from "@/lib/guestDataAnalysis";
import type { GuestAssessment, GuestEvidence } from "@/lib/guestAssessment";
import type { Review } from "@/lib/types";

export type FindingSignalCount = {
  topic_id: string;
  topic_label: string;
  supporting: number;
  contradicting: number;
  analyzed: number;
  windows_analyzed: number;
  method: "deterministic_topic_polarity_v1";
};

function findingPolarity(finding: GuestAssessment["findings"][number]) {
  if (finding.kind === "strength") return "positive" as const;
  if (finding.kind === "drawback") return "negative" as const;
  const votes = finding.evidence.reduce((result, reference) => {
    if (reference.polarity === "positive" || reference.polarity === "negative") result[reference.polarity] += 1;
    return result;
  }, { positive: 0, negative: 0 });
  return votes.positive === votes.negative ? null : votes.positive > votes.negative ? "positive" as const : "negative" as const;
}

export function countWindowFindingSignals(
  assessment: GuestAssessment,
  _evidence: GuestEvidence[],
  sourceWindow: Review[],
  topicHints: Record<string, string[] | undefined> = {}
): Record<string, FindingSignalCount[]> {
  const prepared = prepareReviews(sourceWindow);
  return Object.fromEntries(assessment.findings.flatMap((finding) => {
    const polarity = findingPolarity(finding);
    if (!polarity) return [];
    const opposite = polarity === "positive" ? "negative" : "positive";
    const topicIds = topicHints[finding.id] ?? finding.signal_topics;
    const counts = topicIds.flatMap((topicId) => {
      const topic = REVIEW_SIGNAL_TOPICS.find((item) => item.id === topicId);
      if (!topic) return [];
      const supporting = prepared.filter((review) => review.signals.get(topic.id)?.has(polarity)).length;
      const contradicting = prepared.filter((review) => review.signals.get(topic.id)?.has(opposite)).length;
      if (!supporting) return [];
      return [{ topic_id: topic.id, topic_label: topic.label, supporting, contradicting,
        analyzed: sourceWindow.length, windows_analyzed: 1,
        method: "deterministic_topic_polarity_v1" as const }];
    });
    return counts.length ? [[finding.id, counts]] : [];
  }));
}
