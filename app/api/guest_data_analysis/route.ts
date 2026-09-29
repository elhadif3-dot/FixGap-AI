import { analyzeGuestData } from "@/lib/guestDataAnalysis";
import { getLocalAnalyticsInputs } from "@/lib/guestDataSource";
import { z } from "zod";

const RequestSchema = z.object({ listing_id: z.string().regex(/^\d{1,20}$/) }).strict();
export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ status: "error", error: "Select a valid property." }, { status: 400 });
  }
  try {
    const input = await getLocalAnalyticsInputs(parsed.data.listing_id);
    if (!input) return Response.json({ status: "error", error: "Listing not found in the bundled dataset." }, { status: 404 });
    return Response.json({ status: "ok", analysis: analyzeGuestData(input.listing, input.reviews, input.places) });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message : "Analysis failed." }, { status: 500 });
  }
}
