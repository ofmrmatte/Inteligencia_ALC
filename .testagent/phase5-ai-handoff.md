# Phase 5 optional AI handoff

## Contract

`apps/atendimento/lib/agent-ai.ts` exports `proposeAgentDecision(input, options?)`. It is server-only by use: provider credentials are read only from `process.env` (`OPENAI_API_KEY`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`). `ATENDIMENTO_AI_ENABLED` must equal `true`; otherwise it returns `{ status: "off", reason: "disabled" }` and performs no network request. Configure `ATENDIMENTO_AI_PROVIDER` (`openai` or `gemini`), its model (`OPENAI_MODEL` or `GEMINI_MODEL`), and `ATENDIMENTO_AI_TIMEOUT_MS` (1-15000 ms; default 8000).

Input contains only channel, current step, inbound text, one revisioned script snapshot, and 1-8 deterministic `allowedActions` (`id` and description). The result is either a proposed allowlisted action with provider/model, instruction revision, script code and a closed rationale code (`clear_match`, `ambiguous_input`, `human_requested`, or `insufficient_context`), or an explicit off/fallback status. Free-form model output is never returned as rationale. Fallback reasons are stable codes and intentionally omit provider response bodies and secrets. Requests are capped at 4000 inbound characters and 220 output tokens; there are no retries.

## Integration boundary

Keep `clientReply` / the worker's deterministic transition as the source of state, reply text, handoff and closure. Call this module only from server code after building a minimal authorized context and deterministic action allowlist. Apply a proposal only if the action ID still matches the deterministic validator for the current conversation state; otherwise use the existing deterministic result. Never use model text as a WhatsApp message, SQL, fact, PNR status, or replacement for an existing deterministic rule. Audit the returned action ID, rationale, provider/model, instruction revision and script code; do not log the input, credentials or raw provider response.

`scriptSnapshotFor(channel, code, instructions)` returns a copy of the existing edited/default script paired with `revision`, so callers can retain the exact script identity with a proposed decision without changing settings format. Persisting treatment snapshots, provider configuration UI, worker invocation and audit persistence remain caller/parent integration work; this write set intentionally adds none of them.
