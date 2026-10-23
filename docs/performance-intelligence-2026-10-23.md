# FixGap performance and intelligence calibration

Date: 2026-10-23

## Outcome

Guest mode now returns full-corpus, deterministic property intelligence automatically. The optional Gemini brief remains available for semantic narrative, but it no longer blocks the first useful result.

The full-corpus response ranks strengths, recurring risks, momentum, expectation gaps, and neighborhood gravity. It also exposes prevalence confidence ranges and a 12-active-month signal heatmap.

## Runtime architecture

1. The browser requests `GET /api/guest_data_analysis?listing_id=...` when the selected listing changes.
2. The server loads the bundled listing, review, and place datasets once per process.
3. Reviews are indexed by listing ID during load, avoiding a 48,000-row scan on every request.
4. The analysis scans every cleaned review for the selected listing once and calculates reproducible aggregates.
5. Results are cached per listing in the process and are sent with edge-cacheable response headers.
6. The optional semantic brief uses bounded evidence and verified citations. Independent Pinecone anchor lookups now run concurrently, while neighborhood loading overlaps local review loading.

Nearby venue evidence remains separate from property-review evidence. Straight-line distance is never presented as walking time.

## Measured evidence

Local development server, representative bundled listings:

| Listing source rows | Clean reviews analyzed | Nearby places within 1 km | Server analysis time |
| ---: | ---: | ---: | ---: |
| 1,909 | 1,622 | 523 | 3,499 ms cold; 0 ms warm |
| 1,321-class sample | 1,247 | 486 | 63 ms after dataset warm-up |
| 800-class sample | 642 | 490 | 33 ms after dataset warm-up |

These are local server measurements, not production latency claims. Gemini and Pinecone were not invoked for the instant intelligence path.

## Signal definitions

- Strength: positive review evidence dominates negative evidence for a topic.
- Risk: negative evidence is ranked by frequency, consistency across active months, and recency.
- Momentum: the newest 25% of dated reviews is compared with the older baseline using per-review rates.
- Expectation: explicit listing language is compared with guest evidence; omitted listing claims are not treated as contradictions.
- Neighborhood gravity: venue rating, logarithmic review volume, distance, and category density are combined without attributing venue reviews to the property.
- Confidence range: a 95% Wilson interval around observed topic prevalence, shown as a range rather than false precision.

## Harness execution record

- Primary orchestrator owned integration, implementation, QA, browser verification, and deployment decisions.
- One read-only `research_architecture_explorer` received a bounded brief with no secrets or full transcript. It mapped the runtime path; it changed no files and made no provider calls.
- The research handoff identified serial Pinecone queries, repeated place-table transfer, the timeout envelope, repair-call cascade, and missing stage telemetry.
- The primary independently verified relevant findings before integration.
- Context stayed compact because the subagent received only its objective, scoped paths, constraints, deliverable, and acceptance evidence. Integration decisions stayed in the primary context.

## Hooks and harness calibration

- Real event evidence confirmed `UserPromptSubmit`, `SubagentStart`, `PreCompact`, `SubagentStop`, `Stop`, and `SessionStart` hooks.
- The mixed Hebrew/English request was initially under-classified as `focused`; the classifier now includes analytics, deployment, QA, context-window, review, graph, and Hebrew action markers.
- The command guard initially confused PowerShell `Format-Table` with disk formatting. Matching now requires an actual `format` or `diskpart` command boundary.
- The global harness verifier passes 39/39 checks, including both regressions.

## Verification

- `npm run qa:data-lab`: pass, including real-corpus invariants for three listings and v2 signal/timeline/confidence checks.
- `npx tsc --noEmit`: pass.
- `npm run build`: pass on Next.js 16.4.2.
- `npm audit --audit-level=moderate`: zero vulnerabilities after pinning Next.js 16.4.2, PostCSS 8.5.31, and Sharp 0.35.5.
- Browser: desktop data loaded automatically; 1,622 cleaned reviews and the new visualizations were visible; the console had no errors or warnings.
- Mobile at 390x844: no document-level horizontal overflow after fixing the heatmap scroll container.

The legacy `qa:agent` HTTP suite still reports three contract assertions unrelated to this change: batch-number text, refusal wording, and an exact success-key set. They require reconciliation with the current API contract and are not reported as passing.

## Rollback

All project work is isolated on branch `codex/fixgap-data-intelligence` in a separate Git worktree. Record the commit and production deployment URL when promoted. Rollback is a Git revert or promotion of the prior Vercel deployment; no destructive reset is required.
