import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { GuestAssessmentResult } from "@/lib/guestAssessment";

const MAX_TOKEN_LENGTH = 1_500_000;
const MAX_DECOMPRESSED_BYTES = 2_000_000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.GUEST_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Guest continuation requires a server-side signing secret.");
  return value;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", secret()).update("fixgap-guest-v1:").update(payload).digest();
}

export function sealGuestContinuation(sessionId: string, listingId: string, result: GuestAssessmentResult): string {
  const compact = { ...result, steps: [] };
  const compressed = deflateRawSync(Buffer.from(JSON.stringify({ sessionId, listingId, issuedAt: Date.now(), result: compact })));
  const payload = compressed.toString("base64url");
  const token = `${payload}.${signature(payload).toString("base64url")}`;
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("Guest assessment is too large to continue safely.");
  return token;
}

export function openGuestContinuation(token: string, sessionId: string, listingId: string): GuestAssessmentResult {
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("Invalid guest continuation.");
  const [payload, digest, extra] = token.split(".");
  if (!payload || !digest || extra) throw new Error("Invalid guest continuation.");
  const provided = Buffer.from(digest, "base64url");
  const expected = signature(payload);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid guest continuation.");
  }
  try {
    const decoded = JSON.parse(inflateRawSync(Buffer.from(payload, "base64url"), {
      maxOutputLength: MAX_DECOMPRESSED_BYTES
    }).toString("utf8")) as { sessionId?: string; listingId?: string; issuedAt?: number; result?: GuestAssessmentResult };
    if (decoded.sessionId !== sessionId || decoded.listingId !== listingId ||
      typeof decoded.issuedAt !== "number" || decoded.issuedAt > Date.now() + 60_000 ||
      Date.now() - decoded.issuedAt > MAX_AGE_MS ||
      !decoded.result || !Array.isArray(decoded.result.evidence) || !Array.isArray(decoded.result.assessment?.findings) ||
      !Number.isInteger(decoded.result.retrieval_audit?.source_window_index)) {
      throw new Error("Invalid guest continuation.");
    }
    return decoded.result;
  } catch {
    throw new Error("Invalid guest continuation.");
  }
}
