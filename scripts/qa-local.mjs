import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  new Function("require", "module", "exports", output)(
    (name) => name in dependencies ? dependencies[name] : require(name), module, module.exports
  );
  return module.exports;
}

process.env.FIXGAP_LOCAL_ONLY = "true";
process.env.SUPABASE_URL = "https://offline-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
const runtime = load("lib/runtimeMode.ts");
const database = load("lib/supabaseRuntime.ts", { "@/lib/runtimeMode": runtime });
let calls = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, "GET"); calls++;
  const offset = Number(new URL(url).searchParams.get("offset"));
  const length = Math.min(1000, 3792 - offset);
  return Response.json(Array.from({ length }, (_, i) => ({ id: `${offset + i}`, place_name: "Place",
    category: "Dining", rating: 4.5, latitude: 38.7, longitude: -9.1 })), {
    headers: { "content-range": `${offset}-${offset + length - 1}/3792` }
  });
};
assert.equal((await database.fetchGooglePlacesFromSupabase()).length, 3792);
assert.equal(calls, 4);
calls = 0;
assert.equal(await database.getSupabaseSimulatedPage({ id: "1" }), null);
await database.upsertSupabaseSimulatedPage({ listingId: "1" });
await database.insertSupabaseAuditLog({ id: "1" });
assert.equal(calls, 0);
console.log("PASS: complete pagination and no local Supabase writes.");

const selection = load("lib/nearbySelection.ts");
const place = (name, category, distanceKm = 0.3) => ({ placeName: name, category, distanceKm,
  rating: 4.5, numberOfReviews: 100, latitude: 38.7, longitude: -9.1 });
assert.equal(selection.selectNearbyPlaces([place("A", "Nightlife"), place("B", "Nightlife")], 8).length, 2);
const mixed = selection.selectNearbyPlaces([
  place("A", "Nightlife"), place("B", "Nightlife"), place("C", "Dining"), place("D", "Culture")
], 3);
assert.equal(new Set(mixed.map((item) => item.category)).size, 3);
assert.equal(selection.selectNearbyPlaces([place("A", "Dining"), place("A", "Dining")], 8).length, 1);
console.log("PASS: soft diversity without forced quotas and duplicate places.");

const budget = load("lib/guestEvidenceBudget.ts");
const language = load("lib/narrativeLanguage.ts");
const guestDataAnalysis = load("lib/guestDataAnalysis.ts");
const guestSignalCounts = load("lib/guestSignalCounts.ts", {
  "@/lib/guestDataAnalysis": guestDataAnalysis
});
const guest = load("lib/guestAssessment.ts", {
  "@/lib/data": {}, "@/lib/guestEvidence": {}, "@/lib/llmClient": {}, "@/lib/guestEvidenceBudget": budget,
  "@/lib/narrativeLanguage": language, "@/lib/guestSignalCounts": guestSignalCounts
});
const evidence = [{ id: "r1", review_id: "101", listing_id: "1", date: "2026-01-01",
  text: "The room was renovated and very comfortable.", is_excerpt: false }];
const draft = { summary: "A concise property assessment supported by available guest evidence.", findings: [{
  id: "f1", title: "Renovated room", kind: "strength", observation: "A guest reports a renovated, comfortable room.",
  signal_topics: ["property_quality"],
  interpretation: "May suit guests who value comfortable interiors.",
  evidence: [{ id: "r1", quote: "The room was renovated", polarity: "positive" }],
  listing_claim: null, alignment: "no_claim"
}], neighborhood: { summary: "No neighborhood conclusion can be drawn without nearby context.", place_ids: [] },
  guest_fit: [], questions: [], omitted_findings: [] };
const input = { description: "A centrally located room.", evidence, placeIds: [] };
assert.equal(guest.validateGuestAssessment(draft, input).findings.length, 1);
assert.equal(guest.countFindingSupport(draft, evidence).f1, 1);
const countWindow = [
  { listingId: "1", id: "101", date: "2026-01-01", comments: "The newly renovated room was very comfortable." },
  { listingId: "1", id: "102", date: "2025-12-01", comments: "Our modern room felt fresh after the recent renovation." },
  { listingId: "1", id: "103", date: "2025-11-01", comments: "The room was outdated and needs renovation soon." },
  { listingId: "1", id: "104", date: "2025-10-01", comments: "We enjoyed the central location and helpful staff." }
];
const measured = guestSignalCounts.countWindowFindingSignals(draft, evidence, countWindow);
assert.deepEqual({ topic: measured.f1[0].topic_id, supporting: measured.f1[0].supporting,
  contradicting: measured.f1[0].contradicting, analyzed: measured.f1[0].analyzed },
{ topic: "property_quality", supporting: 2, contradicting: 1, analyzed: 4 });
const ambiguousDraft = structuredClone(draft);
ambiguousDraft.findings[0].signal_topics = ["safety"];
ambiguousDraft.findings[0].evidence[0].quote = "A detail without a known topic";
assert.deepEqual(guestSignalCounts.countWindowFindingSignals(ambiguousDraft,
  [{ ...evidence[0], text: ambiguousDraft.findings[0].evidence[0].quote }],
  [{ listingId: "1", id: "101", date: "2026-01-01", comments: "A detail without a known topic was described clearly." }]), {});
const fabricated = structuredClone(draft); fabricated.findings[0].evidence[0].quote = "The room has a private swimming pool.";
assert.throws(() => guest.validateGuestAssessment(fabricated, input), /non-verbatim/);
const falseClaim = structuredClone(draft); falseClaim.findings[0].listing_claim = "Private swimming pool";
assert.throws(() => guest.validateGuestAssessment(falseClaim, input), /exact quotation/);
const invalidFit = structuredClone(draft); invalidFit.guest_fit = [{ audience: "Family", explanation: "Suitable", finding_ids: ["fake"] }];
assert.throws(() => guest.validateGuestAssessment(invalidFit, input), /unknown finding/);
const duplicate = structuredClone(draft); duplicate.findings[0].evidence.push(duplicate.findings[0].evidence[0]);
assert.throws(() => guest.validateGuestAssessment(duplicate, input), /Duplicate review/);
console.log("PASS: evidence provenance, exact listing claims, suitability references and unique support counts.");

const citationSelection = structuredClone(draft);
citationSelection.findings[0].evidence = [{ citation_id: "r1.p1", polarity: "positive" }];
const resolvedSelection = guest.resolveGuestCitations(citationSelection, input);
assert.deepEqual(resolvedSelection.findings[0].evidence[0], { id: "r1", quote: evidence[0].text, polarity: "positive" });
const unsupportedClaimSelection = structuredClone(citationSelection);
unsupportedClaimSelection.findings[0].listing_claim = "An invented listing promise";
unsupportedClaimSelection.findings[0].alignment = "contradicts";
const safeClaimSelection = guest.resolveGuestCitations(unsupportedClaimSelection, input);
assert.equal(safeClaimSelection.findings[0].listing_claim, null);
assert.equal(safeClaimSelection.findings[0].alignment, "no_claim");
const fakeCitation = structuredClone(citationSelection);
fakeCitation.findings[0].evidence[0].citation_id = "r1.p99";
assert.throws(() => guest.resolveGuestCitations(fakeCitation, input), /Unknown source citations/);
assert.throws(() => guest.resolveGuestCitations(citationSelection, { ...input, evidence: [{ ...evidence[0], id: "r34" }] }),
  /not IDs from previous windows/);
const freeQuote = structuredClone(citationSelection);
freeQuote.findings[0].evidence[0].quote = "A paraphrase must never replace the selected source text.";
assert.throws(() => guest.resolveGuestCitations(freeQuote, input));
const duplicateCitation = structuredClone(citationSelection);
duplicateCitation.findings[0].evidence.push(duplicateCitation.findings[0].evidence[0]);
assert.throws(() => guest.resolveGuestCitations(duplicateCitation, input), /Duplicate review/);
const separatePassages = { ...evidence[0], passages: ["The room was renovated and comfortable.", "Street noise kept us awake during the night."] };
const secondPassage = structuredClone(citationSelection);
secondPassage.findings[0].evidence[0].citation_id = "r1.p2";
assert.equal(guest.resolveGuestCitations(secondPassage, { ...input, evidence: [separatePassages] }).findings[0].evidence[0].quote,
  separatePassages.passages[1]);
const originalForeignText = "الغرفة نظيفة ومريحة والخدمة ممتازة";
assert.equal(guest.resolveGuestCitations(citationSelection, { ...input, evidence: [{ ...evidence[0], text: originalForeignText }] })
  .findings[0].evidence[0].quote, originalForeignText);
assert.throws(() => guest.resolveGuestCitations(citationSelection, { ...input, evidence: [{ ...evidence[0], text: "Too short" }] }), /Unknown source/);
console.log("PASS: immutable citation resolution, exact separate source passages, original-language quotes and rejection of invented, stale or generated citations.");

const gemini = load("lib/geminiClient.ts", { "@/lib/runtimeMode": runtime });
const llm = load("lib/llmClient.ts", { "@/lib/geminiClient": gemini, "@/lib/runtimeMode": runtime, "@/lib/narrativeLanguage": language });
process.env.GEMINI_API_KEY = "test-only"; process.env.LLM_PROVIDER = "gemini";
process.env.LLM_MODE = "live"; process.env.LLM_LIVE_MODULES = "all";
process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
globalThis.fetch = async (_url, options) => {
  const config = JSON.parse(options.body).generationConfig;
  assert.deepEqual(config.responseFormat.text, { mimeType: "APPLICATION_JSON", schema });
  assert.equal(config.responseMimeType, undefined);
  assert.equal(config.responseJsonSchema, undefined);
  assert.equal(config.temperature, undefined);
  return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }] });
};
await gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test", responseJsonSchema: schema });
const constrained = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {
  maxLength: { type: "string", minLength: 15, maxLength: 500 },
  findings: { type: "array", maxItems: 8, items: { type: "object", properties: {
    quote: { type: "string", minLength: 15 }, evidence: { type: "array", minItems: 1, maxItems: 5,
      items: { anyOf: [{ type: "string", maxLength: 20 }, { type: "null" }] } }
  } } }
} };
globalThis.fetch = async (_url, options) => {
  const config = JSON.parse(options.body).generationConfig;
  const wire = config.responseFormat.text.schema;
  assert.equal(wire.$schema, undefined);
  assert.equal(wire.properties.maxLength.type, "string");
  assert.equal(wire.properties.maxLength.maxLength, undefined);
  assert.match(wire.properties.maxLength.description, /Maximum characters: 500/);
  assert.equal(wire.properties.findings.maxItems, undefined);
  assert.match(wire.properties.findings.description, /Maximum items: 8/);
  assert.equal(wire.properties.findings.items.properties.evidence.items.anyOf[0].maxLength, undefined);
  assert.equal(config.thinkingConfig.thinkingLevel, "MINIMAL");
  return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }] });
};
await gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test", responseJsonSchema: constrained });
assert.equal(constrained.properties.findings.maxItems, 8);
assert.equal(constrained.properties.maxLength.maxLength, 500);
const oversized = structuredClone(draft); oversized.findings[0].evidence[0].quote = "x".repeat(501);
assert.throws(() => guest.validateGuestAssessment(oversized, input));
console.log("PASS: simpler wire schema preserves field names, original constraints and strict local validation.");
let rejectedCalls = 0;
globalThis.fetch = async () => {
  rejectedCalls++;
  return Response.json({ error: { message: "Unsupported field for key test-only" } }, { status: 400 });
};
await assert.rejects(() => gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test" }),
  /HTTP 400\. Unsupported field for key \[REDACTED\]/);
assert.equal(rejectedCalls, 1);
globalThis.fetch = async () => new Response("<html>Private proxy diagnostic</html>", { status: 502 });
await assert.rejects(() => gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test" }),
  /HTTP 502\. The provider returned no diagnostic message/);
console.log("PASS: current Gemini JSON format, sanitized diagnostics and no blind HTTP retries.");
let attempts = 0;
globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{
  text: ++attempts === 1 ? "invalid JSON" : '{"ok":true}'
}] }, finishReason: "STOP" }] });
const repaired = await llm.callLlmJsonWithTrace({ module: "analyst", messages: [], mockResponse: { ok: false } });
assert.equal(repaired.output.ok, true); assert.equal(attempts, 2);
globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: "null" }] }, finishReason: "STOP" }] });
await assert.rejects(() => llm.callLlmJsonWithTrace({ module: "analyst", messages: [], mockResponse: { fake: true } }), /two attempts/);
console.log("PASS: bounded JSON repair and no fake live fallback. No external requests were made.");

attempts = 0;
globalThis.fetch = async (_url, options) => {
  attempts++;
  if (attempts === 2) {
    const repair = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.match(repair.validation_error, /cut off at the token limit/);
  }
  return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] },
    finishReason: attempts === 1 ? "MAX_TOKENS" : "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
};
const shorter = await llm.callLlmJsonWithTrace({ module: "Guest evidence analyst", messages: [], mockResponse: null });
assert.equal(shorter.output.ok, true);
assert.equal(shorter.steps.length, 2);
assert.equal(shorter.steps[0].response.finish_reason, "MAX_TOKENS");
assert.equal(shorter.steps[0].response.validation_error.includes("token limit"), true);
globalThis.fetch = async () => { throw new DOMException("Timed out", "TimeoutError"); };
await assert.rejects(() => llm.callLlmJsonWithTrace({ module: "Guest evidence analyst", messages: [], mockResponse: null }),
  /Guest evidence analyst: Gemini request timed out/);
console.log("PASS: truncated output gets one compact repair; provider timeouts keep stage context.");

const originalTimeout = AbortSignal.timeout;
const originalNodeEnv = process.env.NODE_ENV;
const originalTimeoutSetting = process.env.GEMINI_LOCAL_TIMEOUT_SECONDS;
const timeoutDurations = [];
let timeoutCalls = 0;
AbortSignal.timeout = (duration) => {
  timeoutDurations.push(duration);
  return new AbortController().signal;
};
globalThis.fetch = async () => {
  timeoutCalls++;
  throw new DOMException("Timed out", "TimeoutError");
};
try {
  delete process.env.GEMINI_LOCAL_TIMEOUT_SECONDS;
  await assert.rejects(() => llm.callLlmJsonWithTrace({ module: "Guest evidence analyst", messages: [], mockResponse: null }),
    /Guest evidence analyst: Gemini request timed out after 120 seconds/);
  assert.equal(timeoutCalls, 1, "Timeouts must not trigger a second paid request.");
  for (const [setting, expected] of [["150", 150], ["invalid", 120], ["-10", 120], ["999", 180]]) {
    process.env.GEMINI_LOCAL_TIMEOUT_SECONDS = setting;
    await assert.rejects(() => gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test" }),
      new RegExp(`timed out after ${expected} seconds`));
  }
  process.env.FIXGAP_LOCAL_ONLY = "false";
  process.env.NODE_ENV = "production";
  await assert.rejects(() => gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test" }), /after 60 seconds/);
  assert.deepEqual(timeoutDurations, [120000, 150000, 120000, 120000, 180000, 60000]);
  process.env.FIXGAP_LOCAL_ONLY = "true";
  delete process.env.GEMINI_LOCAL_TIMEOUT_SECONDS;
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new DOMException("Body timed out", "AbortError"); } });
  await assert.rejects(() => gemini.requestGeminiJson({ systemPrompt: "Test", userPrompt: "Test" }), /after 120 seconds/);
} finally {
  AbortSignal.timeout = originalTimeout;
  process.env.FIXGAP_LOCAL_ONLY = "true";
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalTimeoutSetting === undefined) delete process.env.GEMINI_LOCAL_TIMEOUT_SECONDS;
  else process.env.GEMINI_LOCAL_TIMEOUT_SECONDS = originalTimeoutSetting;
}
console.log("PASS: configurable bounded local timeout, unchanged production deadline, body timeout and no automatic model retry.");

let fixtureEvidence = evidence;
let fixtureWindowOptions;
const pipeline = load("lib/guestAssessment.ts", {
  "@/lib/guestEvidenceBudget": budget,
  "@/lib/narrativeLanguage": language,
  "@/lib/data": {
    getListingById: async (id) => ({ id, name: "Fixture room", description: input.description,
      amenities: [], accommodates: 2, propertyType: "Room", neighbourhood: "Lisbon" }),
    getLocalReviewsForListing: async () => [],
    getNearbyEvidence: async () => ({ places: [{ placeName: "Fixture museum", category: "Culture",
      rating: 4.5, numberOfReviews: 20, distanceKm: 0.4, reviewsContent: "A welcoming small museum with thoughtful exhibitions and a quiet courtyard." }],
      audit: { selected_categories: { Culture: 1 } } })
  },
  "@/lib/guestEvidence": { retrieveGuestEvidence: async (id, _raw, options) => {
    assert.equal(id, "1");
    fixtureWindowOptions = options;
    return { evidence: fixtureEvidence, sourceWindow: fixtureEvidence.map((item) => ({ listingId: item.listing_id,
      id: item.review_id, date: item.date, comments: item.text })), audit: { source_window_index: options.windowIndex,
      coverage_note: "Selected sample, not representative." } };
  } },
  "@/lib/llmClient": llm, "@/lib/guestSignalCounts": guestSignalCounts
});
let modelCalls = [];
function modelResponses(outputs) {
  modelCalls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    modelCalls.push(body);
    assert.ok(outputs.length, "The pipeline made an unexpected extra model call.");
    let output = outputs.shift();
    if (body.generationConfig.responseFormat.text.schema?.properties?.findings?.items?.properties?.evidence?.items?.properties?.citation_id) {
      output = { ...output, findings: output.findings.map((finding) => ({ ...finding, evidence: finding.evidence.map((ref) => {
        if (ref.citation_id) return ref;
        const source = fixtureEvidence.find((review) => review.id === ref.id);
        const index = (source?.passages ?? [source?.text ?? ""]).findIndex((text) => text.includes(ref.quote));
        return { citation_id: `${ref.id}.p${index < 0 ? 99 : index + 1}`, polarity: ref.polarity };
      }) })) };
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
  };
}
modelResponses([draft, { decision: "Approve", issues: [] }]);
const report = await pipeline.assessGuestProperty("1");
assert.equal(report.supervisor, "Approve");
assert.equal(report.support_counts.f1, 1);
assert.equal(modelCalls.length, 2);
assert.equal(report.steps.filter((step) => step.response.llm_call).length, 2);
const analystInput = JSON.parse(modelCalls[0].contents[0].parts[0].text);
assert.equal(analystInput.guest_reviews[0].review_id, "101");
assert.equal(analystInput.guest_reviews[0].passages[0].citation_id, "r1.p1");
assert.equal(analystInput.guest_reviews[0].passages[0].text, evidence[0].text);
assert.equal(report.assessment.findings[0].evidence[0].quote, evidence[0].text);
assert.equal(report.steps.find((step) => step.response.wire_output)?.response.wire_output.findings[0].evidence[0].citation_id, "r1.p1");
assert.equal(modelCalls[0].generationConfig.responseFormat.text.schema.properties.findings.items.properties.evidence.items.properties.quote, undefined);
assert.equal(analystInput.nearby_places[0].category, "Culture");
assert.equal(analystInput.venue_review_excerpts[0].place_id, "p1");
const controlInput = JSON.parse(modelCalls[1].contents[0].parts[0].text);
assert.equal(controlInput.source.guest_reviews[0].id, "r1");
assert.equal(controlInput.assessment.findings[0].id, "f1");
assert.equal(modelCalls[0].generationConfig.maxOutputTokens, 3072);
assert.equal(modelCalls[1].generationConfig.maxOutputTokens, 768);
assert.ok(report.retrieval_audit.estimated_analyst_input_tokens <= budget.GUEST_INPUT_TOKEN_BUDGET);
assert.ok(report.retrieval_audit.estimated_evidence_tokens <= budget.GUEST_REVIEW_TOKEN_BUDGET);

const revise = { decision: "Revise", issues: [{ target: "f1", correction: "Narrow the interpretation to one guest's experience." }] };
const revised = structuredClone(draft);
revised.findings[0].interpretation = "One guest describes comfort; current conditions require confirmation.";
modelResponses([draft, revise, revised, { decision: "Approve", issues: [] }]);
const revisedReport = await pipeline.assessGuestProperty("1");
assert.equal(modelCalls.length, 4);
assert.equal(revisedReport.assessment.findings[0].interpretation, revised.findings[0].interpretation);
assert.equal(JSON.parse(modelCalls[2].contents[0].parts[0].text).required_corrections[0].target, "f1");

modelResponses([fabricated, fabricated]);
await assert.rejects(() => pipeline.assessGuestProperty("1"), /Guest evidence analyst.*Unknown source citations/);
assert.equal(modelCalls.length, 2);

modelResponses([draft, revise, revised, revise]);
await assert.rejects(() => pipeline.assessGuestProperty("1"), /No verified assessment was published/);
assert.equal(modelCalls.length, 4);
console.log("PASS: complete Guest pipeline, source payloads, call counts, supervised revision and failure paths. All network calls were mocked.");

const paraphrasedUpdate = structuredClone(draft);
paraphrasedUpdate.findings[0].existing_finding_id = "f1";
paraphrasedUpdate.findings[0].relationship = "supports";
paraphrasedUpdate.findings[0].evidence[0].id = "r2";
paraphrasedUpdate.findings[0].listing_claim = "The listing promises renovated rooms.";
paraphrasedUpdate.findings[0].alignment = "supports";
paraphrasedUpdate.findings.push({ ...structuredClone(paraphrasedUpdate.findings[0]), id: "f6",
  existing_finding_id: null, relationship: null, listing_claim: "A translated or invented description." });
fixtureEvidence = [{ ...evidence[0], id: "r2", review_id: "102" }];
const beforeUpdate = structuredClone(report);
modelResponses([paraphrasedUpdate, { decision: "Approve", issues: [] }]);
const updatedReport = await pipeline.assessGuestProperty("1", report);
assert.equal(fixtureWindowOptions.windowIndex, 1);
assert.equal(fixtureWindowOptions.evidenceOffset, 1);
assert.deepEqual(report, beforeUpdate, "Updating must not mutate the previous verified report.");
assert.equal(updatedReport.assessment.summary, report.assessment.summary);
assert.equal(updatedReport.support_counts.f1, 2);
assert.equal(updatedReport.retrieval_audit.source_window_index, 1);
assert.equal(modelCalls.length, 2, "Invalid listing claims are dropped before the normal supervisor call.");
assert.equal(updatedReport.assessment.findings[0].listing_claim, null);
assert.equal(updatedReport.assessment.findings[0].alignment, "no_claim");
assert.equal(updatedReport.steps.filter((step) => step.response.llm_call).length, 2);
fixtureEvidence = evidence;

modelResponses([fabricated, fabricated]);
let failedTrace;
await assert.rejects(() => pipeline.assessGuestProperty("1", report), (error) => {
  failedTrace = error.steps;
  assert.equal(failedTrace[0].module, "Property facts");
  assert.equal(failedTrace.find((step) => step.module === "Review source window").response.source_window_index, 1);
  assert.equal(failedTrace.filter((step) => step.response.llm_call).length, 2);
  assert.ok(failedTrace.filter((step) => step.response.llm_call).every((step) => step.response.parsed_output));
  return /Unknown source citations/.test(error.message);
});
assert.deepEqual(report, beforeUpdate);

globalThis.fetch = async () => { throw new DOMException("Timed out", "TimeoutError"); };
await assert.rejects(() => pipeline.assessGuestProperty("1", report), (error) => {
  assert.equal(error.steps.filter((step) => step.response.llm_call).length, 1);
  assert.equal(error.steps.at(-1).response.error, "provider_request_failed");
  assert.equal(error.steps.at(-1).response.retry_planned, false);
  return /timed out/.test(error.message);
});

const debugRoute = load("app/api/guest_assessment/route.ts", {
  "@/lib/runtimeMode": runtime,
  "@/lib/guestAssessment": {},
  "@/lib/guestContinuation": {},
  "@/lib/guestSessionStore": { updateGuestSession: async () => {
    throw Object.assign(new Error("Invalid listing comparisons"), { steps: failedTrace });
  } }
});
const failedApi = await debugRoute.POST(new Request("http://localhost/api/guest_assessment", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ listing_id: "1", session_id: "qa-debug-session" })
}));
assert.equal(failedApi.status, 502);
const failedBody = await failedApi.json();
assert.deepEqual(failedBody.steps, JSON.parse(JSON.stringify(failedTrace)));
assert.equal(failedBody.result, undefined, "A failed update must not present an unverified result.");

const traceComponent = load("components/AgentTrace.tsx");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const traceHtml = renderToStaticMarkup(createElement(traceComponent.AgentTrace, { steps: failedTrace }));
assert.match(traceHtml, /Raw API step payload/);
assert.match(traceHtml, /2 LLM requests/);
assert.match(traceHtml, /repair planned/);
assert.match(traceHtml, /parsed_output/);
assert.match(traceHtml, /dir="ltr"/);
const ownerTraceHtml = renderToStaticMarkup(createElement(traceComponent.AgentTrace, {
  steps: [{ module: "Owner", prompt: { system_prompt: "test", user_prompt: "test" }, response: { llm_call: true } }],
  summarize: () => ({ title: "Existing Owner summary", action: "fix_property_gap" })
}));
assert.match(ownerTraceHtml, /Existing Owner summary/);
assert.match(ownerTraceHtml, /fix_property_gap/);
let stateIndex = 0;
const failedPanelState = [report, "Invalid listing comparisons", false, failedTrace];
const panelComponent = load("components/GuestAssessmentPanel.tsx", {
  react: { ...require("react"), useEffect: () => {}, useRef: (value) => ({ current: value }),
    useState: () => [failedPanelState[stateIndex++], () => {}] },
  "@/components/AgentTrace": traceComponent
});
const failedPanelHtml = renderToStaticMarkup(createElement(panelComponent.GuestAssessmentPanel, {
  listingId: "1", sessionId: "qa-debug-session"
}));
assert.match(failedPanelHtml, /Update assessment/);
assert.ok(failedPanelHtml.includes(report.assessment.summary));
assert.match(failedPanelHtml, /LLM Steps &amp; Debug/);
assert.match(failedPanelHtml, /Raw API step payload/);
assert.match(failedPanelHtml, /1 מתוך 1 ביקורות שנבדקו תואמות/);
assert.match(failedPanelHtml, /<details class="guestMethod" open=""/);
const thirdWindowPanel = { ...updatedReport,
  retrieval_audit: { ...updatedReport.retrieval_audit, source_window_index: 2 },
  updates: [...(updatedReport.updates ?? []), { ...updatedReport.updates[0], window_index: 2 }],
  update_summaries: [{ window_index: 1, text: "Earlier per-window summary." }] };
failedPanelState[0] = thirdWindowPanel;
failedPanelState[1] = "";
failedPanelState[3] = thirdWindowPanel.steps;
stateIndex = 0;
const thirdWindowHtml = renderToStaticMarkup(createElement(panelComponent.GuestAssessmentPanel, {
  listingId: "1", sessionId: "qa-debug-session"
}));
assert.equal((thirdWindowHtml.match(/New evidence/g) ?? []).length, 1);
assert.match(thirdWindowHtml, /<summary>Evidence<svg/);
assert.ok(!thirdWindowHtml.includes("Earlier per-window summary."));
assert.equal(updatedReport.assessment.summary, report.assessment.summary);
assert.equal(updatedReport.update_summaries.length, 1);
console.log("PASS: second-window provenance repair, original report preservation, complete failure API traces and shared Owner/Guest debug rendering.");

let dashboardState = [];
let dashboardCursor = 0;
const dashboard = load("components/DemoDashboard.tsx", {
  react: { ...require("react"), useMemo: (factory) => factory(), useState: (initial) => {
    const index = dashboardCursor++;
    if (index >= dashboardState.length) dashboardState[index] = typeof initial === "function" ? initial() : initial;
    return [dashboardState[index], () => {}];
  } },
  "@/components/GuestAssessmentPanel": { GuestAssessmentPanel: () => null },
  "@/components/GuestDataLab": { GuestDataLab: () => null },
  "@/components/AgentTrace": traceComponent
});
const dashboardProps = { initialListings: [], listingOptions: [], totalDatasetListings: 0, managedCount: 0, localGuestMode: true };
const renderDashboard = () => {
  dashboardCursor = 0;
  renderToStaticMarkup(createElement(dashboard.DemoDashboard, dashboardProps));
  return dashboardState[1];
};
const firstSession = renderDashboard();
assert.match(firstSession, /^[a-zA-Z0-9_-]{8,120}$/);
assert.equal(renderDashboard(), firstSession, "Updates and rerenders must keep the same research session.");
dashboardState = [];
const refreshedSession = renderDashboard();
assert.notEqual(refreshedSession, firstSession, "Reloading must start a new session rather than restore the old report/window.");
assert.equal(renderDashboard(), refreshedSession);
assert.ok(!readFileSync("components/DemoDashboard.tsx", "utf8").includes("sessionStorage"));
console.log("PASS: browser reload gets a fresh session while same-page updates preserve their session.");

const sourceReviews = Array.from({ length: 260 }, (_, i) => ({ listingId: "1", id: `${1000 + i}`,
  date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
  comments: `Guest ${i} found the room comfortable, but heard some noise in the evening. The host was helpful.` }));
let windowQueries = [];
const retrieval = load("lib/guestEvidence.ts", {
  "@/lib/guestEvidenceBudget": budget,
  "@/lib/pineconeReviews": { queryReviewsByExample: async (query) => {
    windowQueries.push(query);
    const allowed = sourceReviews.filter((review) => query.reviewIds?.includes(review.id));
    return [...allowed.reverse().slice(0, query.topK), sourceReviews[0],
      { ...sourceReviews[259], listingId: "999", id: "foreign" }];
  } }
});
const windowReport = await retrieval.retrieveGuestEvidence("1", [...sourceReviews, sourceReviews[259]]);
assert.equal(windowReport.audit.source_window_count, 200);
assert.equal(windowReport.audit.clean_count, 260);
assert.equal(windowReport.audit.remaining_source_reviews, 60);
assert.ok(windowReport.audit.analyst_review_count > 15, "No fixed 15-review cap should apply.");
assert.ok(windowReport.audit.estimated_evidence_tokens <= budget.GUEST_REVIEW_TOKEN_BUDGET);
assert.ok(windowQueries.some((query) => query.reviewIds.length === 200 && query.topK === 40));
const allowedIds = new Set(sourceReviews.slice(60).map((review) => review.id));
assert.equal(new Set(windowReport.evidence.map((review) => review.review_id)).size, windowReport.evidence.length);
for (const item of windowReport.evidence) {
  assert.ok(allowedIds.has(item.review_id));
  const original = sourceReviews.find((review) => review.id === item.review_id).comments;
  assert.ok(item.passages.every((passage) => original.includes(passage)));
}

const longText = "The host welcomed us warmly. " + "The room has substantial historical context and detailed fixtures. ".repeat(80)
  + "But the street noise made it difficult to sleep at night.";
const passages = budget.sourcePassages(longText, 140);
assert.ok(passages.every((passage) => longText.includes(passage)));
assert.ok(passages.some((passage) => passage.includes("difficult to sleep")));
assert.ok(budget.estimateTokens(passages.join(" ")) <= 145);
const { parseCsv, rowsToObjects } = await import("./csv.mjs");
const sourceRows = rowsToObjects(parseCsv(readFileSync("data/lisbon_reviews_final_with_pois.csv", "utf8")));
const passageCorpus = sourceRows.map((row) => String(row.comments ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
  .filter((text) => text.length >= 35).filter((_, index) => index % Math.max(1, Math.floor(sourceRows.length / 750)) === 0).slice(0, 750);
assert.ok(passageCorpus.length >= 500, "Expected a broad real-review passage QA sample.");
for (const text of passageCorpus) {
  const selected = budget.sourcePassages(text, 140);
  assert.ok(selected.every((passage) => text.includes(passage)), "A selected passage must be verbatim source text.");
  assert.ok(budget.estimateTokens(selected.join(" ")) <= 145, "A selected passage set exceeded its bounded budget.");
}
console.log(`PASS: ${passageCorpus.length} real review texts produced verbatim, token-bounded passages without LLM calls.`);
const stitched = structuredClone(draft);
const stitchedSource = { ...evidence[0], passages: ["The room was renovated", "and very comfortable."],
  text: "The room was renovated\n[...]\nand very comfortable." };
stitched.findings[0].evidence[0].quote = stitchedSource.text;
assert.throws(() => guest.validateGuestAssessment(stitched, { ...input, evidence: [stitchedSource] }), /non-verbatim/);

windowQueries = [];
await retrieval.retrieveOwnerExampleEvidence("1", sourceReviews);
assert.ok(windowQueries.every((query) => query.reviewIds === undefined && query.topK === 16));
const smallWindow = await retrieval.retrieveGuestEvidence("1", sourceReviews.slice(0, 3));
assert.equal(smallWindow.audit.source_window_count, 3);
assert.ok(smallWindow.audit.analyst_review_count <= 3);
console.log("PASS: 200-review source window, token-bounded passages, rare closing caveats, no stitched quotations and unchanged Owner retrieval.");

process.env.PINECONE_API_KEY = "test-only";
process.env.PINECONE_REVIEW_INDEX = "offline-review-index";
process.env.PINECONE_REVIEW_NAMESPACE = "offline-review-namespace";
process.env.DISABLE_PINECONE_RAG = "false";
let vectorQuery;
const vectors = load("lib/pineconeReviews.ts", {
  "@/lib/embeddingClient": {},
  "@pinecone-database/pinecone": { Pinecone: class {
    index() { return { namespace: () => ({ query: async (query) => {
      vectorQuery = query;
      return { matches: ["101", "outside"].map((id) => ({ metadata: {
        listing_id: "1", review_id: id, source: "airbnb_review", text: "A comfortable room with welcoming hosts." } })) };
    } }) }; }
  } }
});
const vectorReviews = await vectors.queryReviewsByExample({ listingId: "1", reviewId: "101", reviewIds: ["101"], topK: 40 });
assert.deepEqual(vectorQuery.filter.review_id, { $in: ["101"] });
assert.equal(vectorQuery.id, "review-1-101");
assert.equal(vectorReviews.length, 1);
console.log("PASS: real Pinecone adapter sends the window filter and defensively rejects out-of-window matches. No embeddings or external requests.");

const olderWindow = await retrieval.retrieveGuestEvidence("1", sourceReviews, { windowIndex: 1, evidenceOffset: 50 });
assert.equal(olderWindow.audit.source_window_count, 60);
assert.equal(olderWindow.audit.remaining_source_reviews, 0);
assert.ok(olderWindow.evidence.every((item) => Number(item.id.slice(1)) > 50 && !allowedIds.has(item.review_id)));

const mixedScript = structuredClone(draft); mixedScript.summary = "המלון שشوכן במיקום מרכזי עם חדרים נעימים.";
assert.throws(() => guest.validateGuestAssessment(mixedScript, input), /Arabic letters/);
const arabicQuote = "الغرفة نظيفة ومريحة والخدمة ممتازة";
const sourceLanguage = structuredClone(draft); sourceLanguage.findings[0].evidence[0].quote = arabicQuote;
assert.equal(guest.validateGuestAssessment(sourceLanguage, { ...input, evidence: [{ ...evidence[0], text: arabicQuote }] }).findings.length, 1);
modelResponses([mixedScript, draft]);
await llm.callLlmJsonWithTrace({ module: "Guest evidence analyst", messages: [], mockResponse: null,
  validate: (candidate) => guest.validateGuestAssessment(candidate, input) });
assert.equal(modelCalls.length, 2);

const base = { ...report, retrieval_audit: { source_window_index: 0, remaining_source_reviews: 200 }, updates: [] };
const continuation = load("lib/guestContinuation.ts");
const guestToken = continuation.sealGuestContinuation("qa-guest-session", "1", base);
assert.equal(continuation.openGuestContinuation(guestToken, "qa-guest-session", "1").retrieval_audit.source_window_index, 0);
assert.throws(() => continuation.openGuestContinuation(guestToken, "different-session", "1"), /Invalid guest continuation/);
assert.throws(() => continuation.openGuestContinuation(`${guestToken[0] === "A" ? "B" : "A"}${guestToken.slice(1)}`,
  "qa-guest-session", "1"), /Invalid guest continuation/);
const newSource = { ...evidence[0], id: "r2", review_id: "102" };
const supporting = structuredClone(draft);
supporting.findings[0].title = "A replacement title must not replace the original";
supporting.findings[0].existing_finding_id = "f1"; supporting.findings[0].relationship = "supports";
supporting.findings[0].evidence[0].id = "r2";
const update = { ...report, assessment: supporting, evidence: [newSource],
  retrieval_audit: { source_window_index: 1, remaining_source_reviews: 0 } };
const cumulative = guest.mergeGuestAssessment(base, update);
assert.deepEqual(cumulative.assessment.findings[0], base.assessment.findings[0]);
assert.equal(cumulative.assessment.summary, base.assessment.summary);
assert.equal(cumulative.support_counts.f1, 2);
assert.equal(cumulative.updates[0].finding.title, supporting.findings[0].title);
const contradictory = structuredClone(update);
contradictory.assessment.findings[0].relationship = "contradicts";
contradictory.evidence[0].review_id = "103";
const withContradiction = guest.mergeGuestAssessment(cumulative, contradictory);
assert.equal(withContradiction.support_counts.f1, 2);
assert.equal(withContradiction.updates.length, 2);
const duplicateSupport = guest.mergeGuestAssessment(cumulative, update);
assert.equal(duplicateSupport.support_counts.f1, 2);
assert.equal(duplicateSupport.evidence.length, 2);
console.log("PASS: later windows, Arabic narrative repair without source changes, append-only findings and distinct supporting/contradictory evidence.");

let failUpdate = false; let sessionCalls = 0; let previousSeen;
const sessionStore = load("lib/guestSessionStore.ts", { "@/lib/guestAssessment": {
  assessGuestProperty: async (_id, previous) => {
    sessionCalls++; previousSeen = previous;
    if (failUpdate) throw new Error("Synthetic failure");
    return previous ? cumulative : base;
  }
} });
await sessionStore.updateGuestSession("qa-session-one", "1");
failUpdate = true;
await assert.rejects(() => sessionStore.updateGuestSession("qa-session-one", "1"), /Synthetic failure/);
assert.equal(sessionStore.getGuestSession("qa-session-one", "1").retrieval_audit.source_window_index, 0);
failUpdate = false;
await sessionStore.updateGuestSession("qa-session-one", "1");
assert.equal(previousSeen.retrieval_audit.source_window_index, 0);
assert.equal(sessionStore.getGuestSession("qa-session-one", "1").retrieval_audit.source_window_index, 1);
const beforeCompleted = sessionCalls;
await sessionStore.updateGuestSession("qa-session-one", "1");
assert.equal(sessionCalls, beforeCompleted);
assert.equal(sessionStore.getGuestSession("qa-session-two", "1"), null);
assert.equal(sessionStore.getGuestSession("qa-session-one", "2"), null);
const detached = sessionStore.getGuestSession("qa-session-one", "1"); detached.assessment.summary = "Mutated client copy";
assert.notEqual(sessionStore.getGuestSession("qa-session-one", "1").assessment.summary, detached.assessment.summary);
console.log("PASS: transactional local sessions, retry without skipping windows, completion without model calls, and session/property isolation.");

const owner = load("lib/ownerPresentation.ts");
const managerStore = load("lib/managerInsightStore.ts");
const managerCases = ["\u05e0\u05d9\u05d4\u05d5\u05dc \u05e8\u05e2\u05e9", "\u05e0\u05d9\u05e7\u05d9\u05d5\u05df \u05d5\u05ea\u05d7\u05d6\u05d5\u05e7\u05d4", "\u05d2\u05d5\u05d3\u05dc \u05d7\u05d3\u05e8\u05d9\u05dd"].map((topic) => ({
  topic, priority: "medium", guestSignal: topic, suggestedAction: topic,
  businessValue: topic, evidenceCount: 2, evidence: [topic]
}));
assert.equal(managerStore.mergeManagerInsights({ sessionId: "qa-hebrew-manager", listingId: "1", scopeKey: "fixes",
  recommendations: managerCases, coverageChecked: 200, coverageTotal: 500,
  coverageComplete: false }).recommendations.length, 3);
const ownerWindows = load("lib/reviewCoverageStore.ts");
const ownerReviews = Array.from({ length: 500 }, (_, index) => ({
  id: `owner-review-${index}`, listingId: "owner-window-test", date: "2026-01-01", comments: `Guest review ${index}`
}));
const ownerWindowInput = { sessionId: "qa-owner-windows", listingId: "owner-window-test",
  scopeKey: "alignment:reviews_and_nearby", reviews: ownerReviews, windowSize: 240 };
const ownerWindow1 = ownerWindows.selectNextReviewCoverageWindow(ownerWindowInput);
const ownerWindow2 = ownerWindows.selectNextReviewCoverageWindow({ ...ownerWindowInput, snapshot: ownerWindow1.snapshot });
const ownerWindow3 = ownerWindows.selectNextReviewCoverageWindow({ ...ownerWindowInput, snapshot: ownerWindow2.snapshot });
assert.deepEqual([ownerWindow1.newlyCoveredCount, ownerWindow2.newlyCoveredCount, ownerWindow3.newlyCoveredCount], [240, 240, 20]);
assert.deepEqual([ownerWindow1.coveredAfterCount, ownerWindow2.coveredAfterCount, ownerWindow3.coveredAfterCount], [240, 480, 500]);
assert.equal(new Set([...ownerWindow1.reviews, ...ownerWindow2.reviews, ...ownerWindow3.reviews].map((review) => review.id)).size, 500);
assert.equal(ownerWindow3.completed, true);
const ownerCopy = load("lib/ownerListingCopy.ts");
const ownerSignals = load("lib/ownerSemanticSignals.ts");
const ownerSchemas = load("lib/schemas.ts");
assert.equal(ownerSchemas.EvidenceReasoningDecisionSchema.safeParse({ decision: "no_justified_gap",
  rationale: "No new gap in this window.", evidence_topics: [], manager_recommendations: [] }).success, true);
const ownerSamples = ownerSignals.sampleOwnerReviewWindow(Array.from({ length: 45 }, (_, index) => ({
  id: `semantic-${index}`, listingId: "owner-window-test", date: "2026-01-01",
  comments: `The rooms feel thoughtfully renovated and comfortable. The details in review ${index} are useful for guests.`
})), "owner-window-test");
assert.equal(ownerSamples.length, 32);
assert.ok(ownerSamples.every((sample) => sample.text.length <= 280));
const candidateSignal = { topic: "Thoughtful renovation", type: "positive_highlight",
  observation: "Guests describe renovated, comfortable rooms.",
  review_ids: [ownerSamples[0].review_id, ownerSamples[1].review_id] };
assert.equal(ownerSchemas.EvidenceReasoningDecisionSchema.safeParse({ decision: "generate_listing_content",
  rationale: "New strength", evidence_topics: [candidateSignal.topic], candidate_signals: [candidateSignal],
  proposed_description_replacement: "תיאור בעברית", manager_recommendations: [] }).success, true);
assert.equal(ownerSignals.validateOwnerSignalCandidates([candidateSignal], ownerSamples).length, 1);
assert.equal(ownerSignals.validateOwnerSignalCandidates([{ ...candidateSignal, review_ids: [ownerSamples[0].review_id, "other-window"] }], ownerSamples).length, 0);
assert.equal(ownerSignals.validateOwnerSignalCandidates([{ ...candidateSignal, review_ids: [ownerSamples[0].review_id, ownerSamples[0].review_id] }], ownerSamples).length, 0);
assert.equal(ownerCopy.isHebrewOwnerDescription("Rossio Garden Hotel is located near Rossio Square."), false);
assert.equal(ownerCopy.isHebrewOwnerDescription("מלון Rossio Garden Hotel נמצא במרכז ליסבון. האורחים מציינים את הניקיון והשירות האדיב, ואת הנגישות הנוחה ברגל לאתרים מרכזיים בעיר."), true);
assert.equal(ownerCopy.hasNearbyPlaceName("ליד המלון נמצא Rumours Lisbon.", [{ name: "Rumours Lisbon" }]), true);
assert.equal(ownerCopy.hasRepeatedNearbyPlace("Rumours Lisbon קרוב למלון. Rumours Lisbon הוא מקום בילוי.", [{ name: "Rumours Lisbon" }]), true);
const labeledNearby = ownerCopy.labelMentionedNearbyPlaces("\u05dc\u05d9\u05d3\u05e0\u05d5 Catfish Cocktail Bar, \u05d5\u05d2\u05dd Rumours Lisbon.", [
  { name: "Catfish Cocktail Bar", category_hebrew: "\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9" },
  { name: "Rumours Lisbon", category_hebrew: "\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9" }
]);
assert.equal((labeledNearby.match(/\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9/g) ?? []).length, 2);
assert.equal(ownerCopy.labelMentionedNearbyPlaces(labeledNearby, [
  { name: "Catfish Cocktail Bar", category_hebrew: "\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9" },
  { name: "Rumours Lisbon", category_hebrew: "\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9" }
]), labeledNearby);
assert.equal(ownerCopy.labelMentionedNearbyPlaces("Rumours Lisbon (5.0/5)", [
  { name: "Rumours Lisbon", category_hebrew: "\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9" }
]), "Rumours Lisbon (\u05de\u05e7\u05d5\u05dd \u05d1\u05d9\u05dc\u05d5\u05d9 \u05dc\u05d9\u05dc\u05d9; 5.0/5)");
assert.match(owner.ownerResponseInHebrew({ status: "ok", steps: [{ response: { in_scope: false } }] }), /מחוץ לתחום/);
const ownerResult = owner.ownerResponseInHebrew({ status: "ok", steps: [], manager_recommendations: [{
  topic: "Noise", priority: "high", guestSignal: "אורחים דיווחו על רעש", suggestedAction: "בדקו את בידוד החלונות",
  businessValue: "שיפור תנאי השינה", evidenceCount: 3, evidence: [] }] });
assert.match(ownerResult, /בדקו את בידוד החלונות/);
assert.equal(ownerResult.includes("Noise"), false);
const coverageResult = owner.ownerResponseInHebrew({ status: "ok", steps: [{ response: {
  coverage_window_size: 200, coverage_covered_after_count: 400,
  coverage_total_reviews_in_scope: 1909, coverage_new_reviews_count: 200, coverage_complete: false
} }], page_update: { status: "executed" } });
assert.match(coverageResult, /חלון ביקורות 2 מתוך 10/);
assert.match(coverageResult, /400 מתוך 1909/);
assert.match(coverageResult, /200 ביקורות בחלון הנוכחי/);
assert.ok(!coverageResult.includes("כיסוי חלקי"));
console.log("PASS: Hebrew Owner presentation and model-free scope refusals.");
