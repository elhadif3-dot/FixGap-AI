import { analyzeGuestData } from "@/lib/guestDataAnalysis";
import { getLocalAnalyticsInputs } from "@/lib/guestDataSource";
import { z } from "zod";

const RequestSchema = z.object({ listing_id: z.string().regex(/^\d{1,20}$/) }).strict();
export const maxDuration = 60;

const resultCache = new Map<string, Promise<ReturnType<typeof analyzeGuestData>>>();

async function run(listingId: string) {
  const started = performance.now();
  let pending = resultCache.get(listingId);
  if (!pending) {
    pending = getLocalAnalyticsInputs(listingId).then((input) => {
      if (!input) throw new Error("Listing not found in the bundled dataset.");
      return analyzeGuestData(input.listing, input.reviews, input.places);
    }).catch((error) => { resultCache.delete(listingId); throw error; });
    resultCache.set(listingId, pending);
  }
  const analysis = await pending;
  const elapsedMs = Math.round(performance.now() - started);
  return Response.json({ status: "ok", analysis, performance: { elapsedMs, cache: elapsedMs < 25 ? "warm" : "computed" } }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", "Server-Timing": `analysis;dur=${elapsedMs}` }
  });
}

export async function GET(request: Request) {
  const parsed = RequestSchema.safeParse({ listing_id: new URL(request.url).searchParams.get("listing_id") });
  if (!parsed.success) return Response.json({ status: "error", error: "Select a valid property." }, { status: 400 });
  try { return await run(parsed.data.listing_id); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    return Response.json({ status: "error", error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ status: "error", error: "Select a valid property." }, { status: 400 });
  }
  try {
    return await run(parsed.data.listing_id);
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message : "Analysis failed." }, { status: 500 });
  }
}
