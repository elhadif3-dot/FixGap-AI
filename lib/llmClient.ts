import type { AgentStep } from "@/lib/types";

type LlmMessage = {
  role: "system" | "user";
  content: string;
};

type LlmJsonOptions<T> = {
  module: string;
  messages: LlmMessage[];
  mockResponse: T;
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
  mockResponse
}: LlmJsonOptions<T>): Promise<LlmJsonResult<T>> {
  const effectivePrompt = effectivePromptParts(messages);

  if (process.env.LLM_MODE !== "live" || !isLiveModuleEnabled(module)) {
    return {
      output: mockResponse,
      calledLive: false,
      step: null,
      steps: []
    };
  }

  const apiKey = process.env.LLMOD_API_KEY;
  const baseUrl = process.env.LLMOD_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error("LLM_MODE=live requires LLMOD_API_KEY and LLMOD_BASE_URL.");
  }

  const result = await requestJsonFromLlm<T>(module, baseUrl, apiKey, effectivePrompt, mockResponse);
  const step = result.steps.at(-1) ?? null;

  return {
    output: result.output,
    calledLive: true,
    step,
    steps: result.steps
  };
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
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}
