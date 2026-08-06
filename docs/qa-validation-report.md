# QA Validation Report

Last strict production-readiness pass: 2026-08-06

Local contract command:

```bash
LLM_MODE=mock DISABLE_PINECONE_RAG=true REQUIRE_PINECONE_RAG=false REQUIRE_SUPABASE_RUNTIME=false npm run qa:agent -- http://127.0.0.1:3100
```

Result: strict submission QA passed. Production is configured separately with live LLMod.ai, Pinecone RAG, Supabase runtime state, and Vercel deployment.

## What The Strict QA Checks

- `GET /api/team_info`
  - HTTP 200.
  - Exact top-level keys: `group_batch_order_number`, `team_name`, `students`.
  - `Batch3_08`.
  - Full student names.
- `GET /api/agent_info`
  - HTTP 200.
  - Exact top-level keys: `description`, `purpose`, `prompt_template`, `prompt_examples`.
  - Prompt examples contain only LLM-call steps.
- `GET /api/model_architecture`
  - HTTP 200.
  - `Content-Type: image/png`.
  - Valid PNG magic bytes.
- `POST /api/execute`
  - Works with `{ "prompt": "..." }` only.
  - Success and error responses contain exactly `status`, `error`, `response`, `steps`.
  - Out-of-scope deterministic guard returns `steps: []`.
  - Every returned LLM step contains only `module`, `prompt`, `response`.
  - Every step prompt must contain only `system_prompt`, `user_prompt`.
  - Step modules are limited to `Autonomous Listing Editor Agent` and `Supervisor / Control Agent`.
- Runtime state endpoints:
  - `/api/listing_page` returns simulated page state.
  - `/api/audit_logs` returns audit records.

## Important Runtime Modes

- Production uses live LLMod.ai for Agent/Supervisor decisions.
- Production uses Pinecone as the review RAG path.
- Production uses Supabase as the primary runtime database.
- Local development can still use mock mode for no-token contract checks.

## Submission Status

Ready for submission after the final compliance pass.
