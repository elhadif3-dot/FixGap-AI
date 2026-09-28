import type { AgentStep } from "@/lib/types";
import { requestGeminiJson } from "@/lib/geminiClient";
import { assertNoArabicLetters } from "@/lib/narrativeLanguage";

type LlmMessage = {
  role: "system" | "user";
  content: string;
};

type LlmJsonOptions<T> = {
  module: string;
  messages: LlmMessage[];
  mockResponse: T;
  validate?: (output: unknown) => T;
  responseJsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
};

type LlmJsonResult<T> = {
  output: T;
  calledLive: boolean;
  step: AgentStep | null;
  steps: AgentStep[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_TEXT_MODEL = "MB5R2CF-azure/gpt-5.4-mini";
const DEFAULT_MAX_TOKENS = "infinite";
const JSON_ONLY_INSTRUCTION = "Return only valid JSON. Do not include markdown, prose, or code fences.";
const JSON_RETRY_INSTRUCTION =
  "The previous response was not valid JSON. Return one complete compact JSON object only. Keep string fields short and close every quote and brace.";

export async function callLlmJson<T>(options: LlmJsonOptions<T>): Promise<T> {
  const result = await callLlmJsonWithTrace(options);
  return result.output;
}

export async function callLlmJsonWithTrace<T>({
  module,
  messages,
  mockResponse,
  validate,
  responseJsonSchema,
  maxOutputTokens
}: LlmJsonOptions<T>): Promise<LlmJsonResult<T>> {
  const ownerHebrew = !/guest|supervisor/i.test(module);
  const effectivePrompt = effectivePromptParts(ownerHebrew ? [...messages, { role: "system", content:
    "Write user-facing rationale, guestSignal, suggestedAction and businessValue in natural Hebrew without Arabic letters. Keep JSON keys, action names, enums, topic, evidence_topics and other internal identifiers in English. Keep source quotations and listing-description copy in their original language. Do not translate machine identifiers." }] : messages);

  if (process.env.LLM_MODE !== "live" || !isLiveModuleEnabled(module)) {
    return {
      output: mockResponse,
      calledLive: false,
      step: null,
      steps: []
    };
  }

  const provider = process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "llmod");
  if (provider === "gemini") {
    return requestJsonFromGemini(module, effectivePrompt, validate, responseJsonSchema, maxOutputTokens);
  }
  if (provider !== "llmod") {
    throw new Error("Unsupported LLM_PROVIDER. Use gemini or llmod.");
  }

  const apiKey = process.env.LLMOD_API_KEY;
  const baseUrl = process.env.LLMOD_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error("LLM_MODE=live requires LLMOD_API_KEY and LLMOD_BASE_URL.");
  }

  const result = await requestJsonFromLlm<T>(module, baseUrl, apiKey, effectivePrompt, mockResponse);
  if (validate) {
    result.output = validate(result.output);
  }
  const step = result.steps.at(-1) ?? null;

  return {
    output: result.output,
    calledLive: true,
    step,
    steps: result.steps
  };
}

async function requestJsonFromGemini<T>(
  module: string,
  prompt: { system_prompt: string; user_prompt: string },
  validate?: (output: unknown) => T,
  responseJsonSchema?: Record<string, unknown>,
  maxOutputTokens?: number
): Promise<LlmJsonResult<T>> {
  const steps: AgentStep[] = [];
  let effective = prompt;
  let lastValidationError = "No usable JSON object was returned.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const result = await requestGeminiJson({
      systemPrompt: effective.system_prompt, userPrompt: effective.user_prompt, responseJsonSchema, maxOutputTokens
    }).catch((error: unknown) => {
      steps.push({ module, prompt: effective, response: { llm_call: true, attempt, provider: "gemini",
        error: "provider_request_failed", message: error instanceof Error ? error.message : "Model request failed.",
        elapsed_ms: Date.now() - startedAt, retry_planned: false } });
      throw Object.assign(new Error(`${module}: ${error instanceof Error ? error.message : "Model request failed."}`), { steps });
    });
    const parsed = parseJsonObject<unknown>(result.content);
    let validationError = result.finishReason === "MAX_TOKENS"
      ? (/guest/i.test(module)
        ? "The output was cut off at the token limit. Return a shorter complete object: fewer findings, brief explanations and one or two supplied citation IDs per finding."
        : "The output was cut off at the token limit. Return a shorter complete object: fewer findings, brief explanations and one or two short exact quotes per finding.")
      : "Return one JSON object, not an array, null, or plain text.";
    let output: T | undefined;
    let valid = false;
    if (result.finishReason !== "MAX_TOKENS" && parsed.ok && parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)) {
      try {
        output = validate ? validate(parsed.value) : parsed.value as T;
        if (!/guest|supervisor/i.test(module)) {
          const texts: string[] = [];
          const visit = (value: unknown) => {
            if (!value || typeof value !== "object") return;
            for (const [key, child] of Object.entries(value)) {
              if (["rationale", "guestSignal", "suggestedAction", "businessValue"].includes(key) && typeof child === "string") texts.push(child);
              else if (child && typeof child === "object") visit(child);
            }
          };
          visit(output); assertNoArabicLetters(texts);
          if (texts.some((text) => text.trim() && !/[\u0590-\u05FF]/.test(text))) {
            throw new Error("Write the user-facing rationale, guestSignal, suggestedAction and businessValue in Hebrew. Preserve machine identifiers and source quotations.");
          }
        }
        valid = true;
      } catch (error) {
        validationError = error instanceof Error ? error.message.slice(0, 800) : "Schema validation failed.";
      }
    }
    lastValidationError = validationError;
    steps.push({
      module, prompt: effective,
      response: {
        ...(valid ? liveStepResponse(output, attempt) as Record<string, unknown> : {
          llm_call: true, attempt, error: "invalid_json_or_schema", retry_planned: attempt < 2,
          validation_error: validationError, raw_response: result.content.slice(0, 12_000),
          ...(parsed.ok ? { parsed_output: parsed.value } : {})
        }),
        provider: "gemini", model: result.model, usage: result.usage, finish_reason: result.finishReason,
        elapsed_ms: Date.now() - startedAt,
        ...(valid && /guest/i.test(module) && parsed.ok ? { wire_output: parsed.value } : {})
      }
    });
    if (valid) {
      return { output: output as T, calledLive: true, step: steps.at(-1) ?? null, steps };
    }
    effective = {
      system_prompt: `${prompt.system_prompt}\n\nCorrect the reported JSON, schema or provenance validation failures. Preserve supported meaning; do not invent facts.`
        + (/guest/i.test(module) ? " For unsupported listing comparisons, copy a valid exact source quotation or set listing_claim to null and alignment to no_claim. Review-backed observations may remain without a listing comparison. For evidence, select valid supplied citation_id values that actually support the finding; never generate review quote text or invent source IDs." : ""),
      user_prompt: JSON.stringify({ original_request: prompt.user_prompt, validation_error: validationError,
        previous_invalid_output: result.content.slice(0, 12_000) })
    };
  }
  // A live failure must never be silently presented as a successful mock result.
  throw Object.assign(new Error(`Gemini returned invalid JSON/schema for ${module} after two attempts. ${lastValidationError}`), { steps });
}

async function requestJsonFromLlm<T>(
  module: string,
  baseUrl: string,
  apiKey: string,
  prompt: { system_prompt: string; user_prompt: string },
  mockResponse: T
): Promise<{ output: T; steps: AgentStep[] }> {
  const attempts = [prompt, retryPrompt(prompt)];
  const steps: AgentStep[] = [];
  let lastContent = "";

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attemptPrompt = attempts[attemptIndex];
    const response = await fetch(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildChatBody(attemptPrompt))
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`LLM request failed for ${module}: HTTP ${response.status}. ${errorText.slice(0, 240)}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`LLM returned an empty response for ${module}.`);
    }

    lastContent = content;
    const parsed = parseJsonObject<T>(content);
    if (parsed.ok) {
      steps.push({
        module,
        prompt: attemptPrompt,
        response: liveStepResponse(parsed.value, attemptIndex + 1)
      });
      return { output: parsed.value, steps };
    }

    steps.push({
      module,
      prompt: attemptPrompt,
      response: {
        llm_call: true,
        attempt: attemptIndex + 1,
        error: "invalid_json",
        raw_response_preview: content.slice(0, 240),
        retry_planned: attemptIndex < attempts.length - 1
      }
    });
  }

  const lastStep = steps.at(-1);
  if (lastStep && lastStep.response && typeof lastStep.response === "object" && !Array.isArray(lastStep.response)) {
    Object.assign(lastStep.response, {
      deterministic_fallback_used: true,
      fallback_reason: `LLM returned invalid JSON for ${module} after ${attempts.length} attempts.`
    });
  }

  return { output: mockResponse, steps };
}

function buildChatBody(prompt: { system_prompt: string; user_prompt: string }) {
  const body: Record<string, unknown> = {
    model: process.env.LLMOD_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages: [
      {
        role: "system",
        content: prompt.system_prompt
      },
      {
        role: "user",
        content: prompt.user_prompt
      }
    ]
  };

  const maxTokens = maxTokensFromEnv();
  if (maxTokens !== null) {
    body.max_tokens = maxTokens;
  }

  if (process.env.LLM_TEMPERATURE) {
    body.temperature = Number(process.env.LLM_TEMPERATURE);
  }

  if (process.env.LLM_RESPONSE_FORMAT === "json_object") {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function maxTokensFromEnv(): number | null {
  const rawValue = process.env.LLM_MAX_TOKENS ?? DEFAULT_MAX_TOKENS;
  const normalized = String(rawValue).trim().toLowerCase();

  if (!normalized || normalized === "infinite" || normalized === "none" || normalized === "unlimited") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function retryPrompt(prompt: { system_prompt: string; user_prompt: string }): { system_prompt: string; user_prompt: string } {
  return {
    system_prompt: [prompt.system_prompt, JSON_RETRY_INSTRUCTION].join("\n\n"),
    user_prompt: prompt.user_prompt
  };
}

function liveStepResponse<T>(output: T, attempt: number): unknown {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return {
      ...(output as Record<string, unknown>),
      llm_call: true,
      attempt
    };
  }

  return {
    llm_call: true,
    attempt,
    value: output
  };
}

function effectivePromptParts(messages: LlmMessage[]): { system_prompt: string; user_prompt: string } {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const user = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const systemPrompt = [...system, JSON_ONLY_INSTRUCTION].join("\n\n");

  return {
    system_prompt: systemPrompt,
    user_prompt: user.join("\n\n")
  };
}

function parseJsonObject<T>(content: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(content) as T };
  } catch {
    const extracted = extractJsonObject(content);
    if (!extracted) {
      return { ok: false };
    }

    try {
      return { ok: true, value: JSON.parse(extracted) as T };
    } catch {
      return { ok: false };
    }
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function isLiveModuleEnabled(module: string): boolean {
  const configured = process.env.LLM_LIVE_MODULES?.trim();
  if (!configured || configured.toLowerCase() === "all") {
    return true;
  }

  const moduleKey = module.toLowerCase().includes("supervisor") ? "supervisor" : "agent";
  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes(moduleKey);
}

function extractJsonObject(value: string): string | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? value;
  const start = candidate.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return null;
}
