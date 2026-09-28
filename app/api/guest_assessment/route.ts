import { getGuestSession, updateGuestSession } from "@/lib/guestSessionStore";
import { assessGuestProperty } from "@/lib/guestAssessment";
import { openGuestContinuation, sealGuestContinuation } from "@/lib/guestContinuation";
import { isLocalOnly } from "@/lib/runtimeMode";
import { z } from "zod";

const RequestSchema = z.object({ listing_id: z.string().regex(/^\d{1,20}$/),
  session_id: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/) }).strict();
const PostSchema = RequestSchema.extend({ continuation: z.string().max(1_500_000).optional() });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = RequestSchema.safeParse({ listing_id: params.get("listing_id"), session_id: params.get("session_id") });
  if (!parsed.success) return Response.json({ error: "Select a valid property and session." }, { status: 400 });
  return Response.json({ status: "ok", result: isLocalOnly()
    ? getGuestSession(parsed.data.session_id, parsed.data.listing_id) : null });
}

export async function POST(request: Request) {
  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select a valid property." }, { status: 400 });
  try {
    if (isLocalOnly()) {
      return Response.json({ status: "ok", result: await updateGuestSession(parsed.data.session_id, parsed.data.listing_id) });
    }
    const previous = parsed.data.continuation
      ? openGuestContinuation(parsed.data.continuation, parsed.data.session_id, parsed.data.listing_id) : undefined;
    if (previous && Number(previous.retrieval_audit.remaining_source_reviews) === 0) {
      return Response.json({ status: "ok", result: previous, continuation: parsed.data.continuation });
    }
    const result = await assessGuestProperty(parsed.data.listing_id, previous);
    return Response.json({ status: "ok", result,
      continuation: sealGuestContinuation(parsed.data.session_id, parsed.data.listing_id, result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assessment failed.";
    const steps = error && typeof error === "object" && "steps" in error && Array.isArray(error.steps) ? error.steps : [];
    console.error("[guest_assessment]", message);
    return Response.json({ status: "error", error: message, steps }, { status: message.includes("already running") ? 409 : 502 });
  }
}
