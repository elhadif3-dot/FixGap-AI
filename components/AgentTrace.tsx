import type { AgentStep } from "@/lib/types";

export type TraceSummary = {
  title: string;
  action?: string;
  rationale?: string;
  observation?: string;
  decision?: string;
  status?: string;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function summarizeGuestStep(step: AgentStep): TraceSummary {
  const response = record(step.response);
  if (typeof response.error === "string") return {
    title: step.module,
    status: response.retry_planned === true ? "repair planned" : "failed",
    observation: typeof response.validation_error === "string" ? response.validation_error
      : typeof response.message === "string" ? response.message : response.error
  };
  return {
    title: step.module,
    decision: typeof response.decision === "string" ? response.decision : undefined,
    status: response.llm_call === true ? "completed" : "deterministic",
    observation: typeof response.summary === "string" ? response.summary : undefined
  };
}

export function AgentTrace({ steps, title = "Action Trace", summarize = summarizeGuestStep }: {
  steps: AgentStep[];
  title?: string;
  summarize?: (step: AgentStep) => TraceSummary;
}) {
  const llmCalls = steps.filter((step) => {
    const response = record(step.response);
    return response.llm_call === true || record(response.response).llm_call === true;
  }).length;
  return <div className="stepList" dir="ltr">
    <h4>{title}</h4>
    <p className="traceModule">{steps.length} recorded steps | {llmCalls} LLM requests</p>
    {steps.length === 0 ? <div className="emptyState">No runtime actions were recorded for this run.</div> : null}
    {steps.map((step, index) => {
      const summary = summarize(step);
      const response = record(step.response);
      const usage = record(response.usage);
      return <details className="stepBox" key={`${step.module}-${index}`}
        open={index < 2 || /supervisor/i.test(step.module) || index === steps.length - 1}>
        <summary><span>Action {index + 1}</span><strong>{summary.title}</strong></summary>
        <div className="traceSummary">
          <div className="traceModule">{step.module}</div>
          {summary.action ? <div>Selected action: <strong>{summary.action}</strong></div> : null}
          {summary.decision ? <div>Supervisor decision: <strong>{summary.decision}</strong></div> : null}
          {summary.status ? <div>Status: <strong>{summary.status}</strong></div> : null}
          {response.llm_call === true ? <div className="traceModule">
            {typeof response.attempt === "number" ? `Attempt ${response.attempt} | ` : ""}
            {typeof usage.promptTokenCount === "number" ? `${usage.promptTokenCount} input tokens | ` : ""}
            {typeof usage.candidatesTokenCount === "number" ? `${usage.candidatesTokenCount} output tokens | ` : ""}
            {typeof usage.thoughtsTokenCount === "number" ? `${usage.thoughtsTokenCount} thinking tokens | ` : ""}
            {typeof response.elapsed_ms === "number" ? `${(response.elapsed_ms / 1000).toFixed(1)}s` : ""}
          </div> : null}
          {summary.rationale ? <p dir="auto">{summary.rationale}</p> : null}
          {summary.observation ? <p dir="auto">{summary.observation}</p> : null}
        </div>
        <details className="rawStep"><summary>Raw API step payload</summary>
          <pre>{JSON.stringify(step, null, 2)}</pre>
        </details>
      </details>;
    })}
  </div>;
}
