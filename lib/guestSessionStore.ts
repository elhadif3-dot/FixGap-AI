import { assessGuestProperty, type GuestAssessmentResult } from "@/lib/guestAssessment";

const state = globalThis as typeof globalThis & {
  __guestSessions?: Map<string, { result: GuestAssessmentResult; touched: number }>;
  __guestPending?: Set<string>;
};
const sessions = state.__guestSessions ??= new Map();
const pending = state.__guestPending ??= new Set();
const keyFor = (sessionId: string, listingId: string) => `${sessionId}:${listingId}`;

function prune() {
  for (const [key, session] of sessions) {
    if (Date.now() - session.touched > 2 * 60 * 60 * 1000 && !pending.has(key)) sessions.delete(key);
  }
  while (sessions.size > 32) {
    const key = [...sessions.keys()].find((candidate) => !pending.has(candidate));
    if (!key) break;
    sessions.delete(key);
  }
}

export function getGuestSession(sessionId: string, listingId: string): GuestAssessmentResult | null {
  prune();
  const session = sessions.get(keyFor(sessionId, listingId));
  if (!session) return null;
  session.touched = Date.now();
  return structuredClone(session.result);
}

export async function updateGuestSession(sessionId: string, listingId: string): Promise<GuestAssessmentResult> {
  const key = keyFor(sessionId, listingId);
  if (pending.has(key)) throw new Error("An update is already running for this property.");
  const previous = getGuestSession(sessionId, listingId);
  if (previous && Number(previous.retrieval_audit.remaining_source_reviews) === 0) return previous;
  pending.add(key);
  try {
    const result = await assessGuestProperty(listingId, previous ?? undefined);
    // Commit the report/cursor together only after a verified update succeeds.
    sessions.set(key, { result: structuredClone(result), touched: Date.now() });
    prune();
    return result;
  } finally { pending.delete(key); }
}
