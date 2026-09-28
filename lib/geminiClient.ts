import { isLocalOnly } from "@/lib/runtimeMode";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
};

function providerSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema };
  const constraints: string[] = [];
  // Keep validation limits in Zod; nested cardinality constraints can overwhelm the provider decoder.
  for (const [key, label] of [["minLength", "Minimum characters"], ["maxLength", "Maximum characters"],
    ["minItems", "Minimum items"], ["maxItems", "Maximum items"]]) {
    if (typeof result[key] === "number") constraints.push(`${label}: ${result[key]}.`);
    delete result[key];
  }
  delete result.$schema;
  if (constraints.length) result.description = [result.description, ...constraints].filter(Boolean).join(" ");
  for (const key of ["properties", "$defs", "definitions"]) {
    const entries = result[key];
    if (entries && typeof entries === "object" && !Array.isArray(entries)) {
      result[key] = Object.fromEntries(Object.entries(entries).map(([name, child]) =>
        [name, providerSchema(child as Record<string, unknown>)]));
    }
  }
  for (const key of ["items", "additionalProperties"]) {
    const child = result[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      result[key] = providerSchema(child as Record<string, unknown>);
    }
  }
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    if (Array.isArray(result[key])) result[key] = result[key].map((child) => providerSchema(child));
  }
  return result;
}

export async function requestGeminiJson(input: {
  systemPrompt: string;
  userPrompt: string;
  responseJsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<{ content: string; model: string; usage: GeminiResponse["usageMetadata"]; finishReason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini requires GEMINI_API_KEY in .env.local.");
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error("GEMINI_MODEL must be a model ID, not a URL.");
  }
  const configuredTokens = Math.min(input.maxOutputTokens ?? 8192, Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096));
  const maxOutputTokens = Number.isFinite(configuredTokens)
    ? Math.max(256, Math.min(8192, Math.floor(configuredTokens))) : 4096;
  const configuredSeconds = Number(process.env.GEMINI_LOCAL_TIMEOUT_SECONDS || 120);
  const timeoutSeconds = isLocalOnly()
    ? (Number.isFinite(configuredSeconds) && configuredSeconds > 0
      ? Math.max(15, Math.min(180, Math.floor(configuredSeconds))) : 120)
    : 60;
  const connectionError = (error: unknown): never => {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new Error(timedOut ? `Gemini request timed out after ${timeoutSeconds} seconds.`
      : "Gemini connection failed. Check the local network connection.");
  };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
      generationConfig: {
        responseFormat: { text: {
          mimeType: "APPLICATION_JSON",
          ...(input.responseJsonSchema ? { schema: providerSchema(input.responseJsonSchema) } : {})
        } },
        maxOutputTokens,
        ...(model.startsWith("gemini-3") ? {} : { temperature: 0.2 }),
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "MINIMAL" } } : {}),
      }
    })
  }).catch(connectionError);
  if (!response.ok) {
    const body = await response.text().catch(connectionError);
    let detail = "The provider returned no diagnostic message.";
    try {
      const error = (JSON.parse(body) as { error?: { message?: unknown; status?: unknown } }).error;
      if (typeof error?.message === "string") detail = error.message;
    } catch {
      // Do not expose an HTML proxy response or arbitrary response body in the UI.
    }
    detail = detail.split(apiKey).join("[REDACTED]")
      .replace(/AIza[\w-]+/g, "[REDACTED]")
      .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[REDACTED]")
      .slice(0, 1000);
    throw new Error(`Gemini request failed: HTTP ${response.status}. ${detail}`);
  }
  const payload = await response.json().catch(connectionError) as GeminiResponse;
  const candidate = payload.candidates?.[0];
  const content = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("") || "";
  if (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
    throw new Error(`Gemini did not finish a complete response (${candidate.finishReason}).`);
  }
  if (!content.trim() && candidate?.finishReason !== "MAX_TOKENS") {
    throw new Error("Gemini returned no usable JSON response.");
  }
  return { content, model, usage: payload.usageMetadata, finishReason: candidate?.finishReason };
}
