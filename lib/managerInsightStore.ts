import type { ManagerRecommendation } from "@/lib/types";

type StoredManagerInsight = {
  recommendations: ManagerRecommendation[];
  coverageChecked: number;
  coverageTotal: number;
  coverageComplete: boolean;
  updatedAt: string;
};

type Store = {
  scopes: Map<string, StoredManagerInsight>;
};

const globalStore = globalThis as typeof globalThis & {
  __airbnbManagerInsightStore?: Store;
};

function store(): Store {
  if (!globalStore.__airbnbManagerInsightStore) {
    globalStore.__airbnbManagerInsightStore = {
      scopes: new Map()
    };
  }

  return globalStore.__airbnbManagerInsightStore;
}

export function mergeManagerInsights(input: {
  sessionId: string;
  listingId: string;
  scopeKey: string;
  recommendations: ManagerRecommendation[];
  coverageChecked: number;
  coverageTotal: number;
  coverageComplete: boolean;
}): StoredManagerInsight {
  const key = insightKey(input.sessionId, input.listingId, input.scopeKey);
  const current = store().scopes.get(key);
  const merged = new Map<string, ManagerRecommendation>();

  for (const item of current?.recommendations ?? []) {
    merged.set(canonicalIssueKey(item), item);
  }

  for (const item of input.recommendations) {
    const issueKey = canonicalIssueKey(item);
    const previous = merged.get(issueKey);
    merged.set(issueKey, previous ? mergeRecommendation(previous, item) : item);
  }

  const value: StoredManagerInsight = {
    recommendations: [...merged.values()]
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.evidenceCount - a.evidenceCount)
      .slice(0, 6),
    coverageChecked: input.coverageChecked,
    coverageTotal: input.coverageTotal,
    coverageComplete: input.coverageComplete,
    updatedAt: new Date().toISOString()
  };
  store().scopes.set(key, value);
  return value;
}

export function getManagerInsights(input: {
  sessionId: string;
  listingId: string;
  scopeKey: string;
}): StoredManagerInsight | undefined {
  return store().scopes.get(insightKey(input.sessionId, input.listingId, input.scopeKey));
}

export function resetManagerInsightsForListing(sessionId: string, listingId: string): void {
  const prefix = `${safeKey(sessionId)}:${listingId}:`;
  for (const key of store().scopes.keys()) {
    if (key.startsWith(prefix)) {
      store().scopes.delete(key);
    }
  }
}

function mergeRecommendation(
  previous: ManagerRecommendation,
  next: ManagerRecommendation
): ManagerRecommendation {
  const priority = priorityRank(next.priority) < priorityRank(previous.priority)
    ? next.priority
    : previous.priority;
  const evidence = uniqueStrings([...previous.evidence, ...next.evidence]).slice(0, 5);

  return {
    topic: previous.topic.length <= next.topic.length ? previous.topic : next.topic,
    priority,
    guestSignal: next.guestSignal.length > previous.guestSignal.length ? next.guestSignal : previous.guestSignal,
    suggestedAction: next.suggestedAction.length > previous.suggestedAction.length
      ? next.suggestedAction
      : previous.suggestedAction,
    businessValue: next.businessValue.length > previous.businessValue.length ? next.businessValue : previous.businessValue,
    evidenceCount: previous.evidenceCount + next.evidenceCount,
    evidence
  };
}

function canonicalIssueKey(recommendation: ManagerRecommendation): string {
  const text = `${recommendation.topic} ${recommendation.guestSignal}`.toLowerCase();

  if (/wi-?fi|internet|connection|router/.test(text)) return "wifi";
  if (/clean|dirty|dust|smell|odor|odour|housekeeping/.test(text)) return "cleaning";
  if (/noise|loud|street|sleepers?|window/.test(text)) return "noise";
  if (/small|tiny|compact|cramped|space|room size|luggage/.test(text)) return "space";
  if (/stair|step|elevator|lift|access|arrival|luggage/.test(text)) return "access";
  if (/hot|warm|cold|temperature|air conditioning|a\/c|\bac\b|heating|ventilation/.test(text)) return "temperature";
  if (/bed|mattress|pillow|sleep|comfort/.test(text)) return "sleep_comfort";
  if (/check-?in|front desk|reception|staff|service/.test(text)) return "service";
  if (/coffee|kettle|hot drink/.test(text)) return "coffee";

  return safeKey(recommendation.topic.toLowerCase());
}

function priorityRank(priority: ManagerRecommendation["priority"]): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      unique.push(normalized);
    }
  }
  return unique;
}

function insightKey(sessionId: string, listingId: string, scopeKey: string): string {
  return `${safeKey(sessionId)}:${listingId}:${safeKey(scopeKey)}`;
}

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 180);
}
