# Atendimento: operational UX and AI credentials review

Review branch: `codex/atendimento-ux-operational`, based on `main` at
`4e527cb4c1465eed3ac75845f6a1e46d95f94f08`. No production operation is part of
this delivery. No merge, live migration, deployment, WhatsApp send, Meta change
or production AI activation was performed. RH and attachment blocking are unchanged.
The connector 1.2.4 patch was separated into PR #87; this PR retains the current connector.

## Operational ownership

- The Core operational catalog is read-only here. Coordinator/supervisor names
  are reference data, not identities, permissions, template senders or assignments.
- An attendant must be an enabled central identity with explicit Atendimento
  access and explicit operational `agent` enrollment. Base coverage can only
  narrow the identity's existing central scope; it cannot grant central access.
- Operators, coverage and assignments reuse the existing authorization and
  directory lock. Fresh central identities are checked before persistence.
- `POST /api/coverage` accepts a canonical `unitKey`, the `expected` membership
  snapshot and `assignments` containing `userId` and `primary|substitute`.
  Concurrent coverage changes return 409. Only that unit's attendance membership
  changes; other memberships and the organogram remain intact. Audit is atomic.
- The queues apply base, sigla, owner and PNR filters before pagination and
  counting. Manual transfer retains version checks, mandatory reason, immutable
  history and cancellation of stale queued replies. Automatic mode is not enabled
  by this change. Recent redistributions are ownership changes in the last 7 days.
- Operator/base editors use native modal dialogs, internal scrolling and focus
  restoration. Tables paginate at 30 records; mobile tables may scroll internally
  without horizontal overflow of the page.

## Overview and automations

The summary reuses the existing scoped Overview response and its refresh stream;
cards do not add individual queries. Missing, blank or invalid confirmed financial
values display an unavailable marker, not zero. Confirmed subtotals remain labeled.

Automation saves patch only the existing three flags and fixed 30-minute interval.
Legacy attributes, including `operatorName`, remain stored for compatibility, but
this field is neither editable nor used as a replacement for the assigned PNR
owner. Existing dispatch tests verify each owner's name snapshot, not the batch
initiator's identity. Ellie and the human sender remain separate. The contents of
the customer/driver playbooks and immutable safety rules are unchanged.

## AI credentials and models

- `GET /api/ai-config` returns safe configuration, usage and credential status,
  never keys, encrypted records or credential fingerprints.
- Credential replace/remove uses `GET/POST /api/ai-credentials`, the existing
  critical-operation MFA flow and bounded same-origin requests. The one-use proof
  binds actor, current central session, provider, operation and exact key intent.
  Central revocation, expiry, replay and changed intent fail closed.
- Secrets use the existing AES-256-GCM implementation, fresh 12-byte IV and
  authenticated tag, stored server-side in `alc_atendimento.settings` under
  `ai_credential_openai` or `ai_credential_gemini`. Secret input is transient;
  cancellation, MFA handoff and session clearing remove it from the form.
  No keys are added to browser storage, public environment variables or audit.
- Precedence: saved encrypted credential first; otherwise `OPENAI_API_KEY`, or
  `GEMINI_API_KEY` before `GOOGLE_API_KEY`. A corrupt saved credential does **not**
  silently fall back. Removing a saved key restores environment fallback if one
  exists; disabling AI is a separate explicit operation.
- `GET /api/ai-models?provider=openai|gemini` uses fixed provider URLs, no redirects,
  bounded responses and a 5-minute in-process cache keyed by provider/credential.
  Only documented models compatible with the adapter's structured output appear.
  Catalog access does not guarantee a particular account has inference access.
- A manual model ID must be safe and pass the same structured adapter probe before
  activation. Verification is bound to that model and credential; changing or
  removing a saved credential invalidates its probe. Runtime validates the model
  before reserving a call, retains privacy checks and validates canonical actions.
- `POST /api/ai-test` requires administrative access, same origin and explicit
  `confirmed: true`. It uses synthetic text only, never a WhatsApp message, and
  does not enable AI. UI confirmation warns that the call may be billed.
- Durable admission permits 10 uncached catalogs and 3 tests per administrator
  per 15 minutes. Existing MFA rate limits also protect credential operations.
  Tests share the worker's UTC daily budget; failed external attempts are not
  refunded. Probe persistence and its secret-free audit commit together.
- Deterministic fallback remains available for missing credentials, invalid models,
  malformed/provider responses, timeouts, limits and storage failures. Provider
  bodies/errors are not echoed as diagnostic messages.

Adapter references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat),
[OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[Gemini structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[Gemini models API](https://ai.google.dev/api/models).

## Migration, key rotation and rollback

Migration `apps/atendimento/db/010_ai_provider_settings.sql` is for the Aux
`alc_atendimento` schema only. It extends MFA operation/destination constraints
and adds the private rate-limit ledger. RLS is enabled; PUBLIC, anon and
authenticated do not receive grants. Existing rows, Core and RH are not rewritten.

Only after separate deployment approval, run the existing guarded migration
runner with the correct Aux connection, then release compatible server/worker
versions. The migration runner wraps each pending migration in a transaction.
Do not apply this SQL to Core or RH and do not run it outside that runner.

`ATENDIMENTO_ENCRYPTION_KEY` is a server secret of 64 hexadecimal characters.
It also protects existing Meta credentials, MFA challenges and entry receipts.
Do not rotate it by merely changing Railway's environment value: existing
ciphertexts would become unreadable. A separately approved maintenance procedure
must pause credential writes/affected workers, inventory all protected records,
decrypt with the old key and re-encrypt with a fresh IV using the new key in a
controlled transaction, invalidate pending MFA proofs, and coordinate the new
key across all replicas before resuming. Entry receipts require re-entry.
Keep the old key securely available for the controlled rollback window; never
print plaintext, ciphertext inventories or keys in logs or source control.
Automated rotation is not implemented in this PR.

For an application rollback, disable AI explicitly first: older code only uses
environment credentials and ignores the new vault. Retain the additive ledger
and compatible expanded constraints; do not drop records, revoke existing access
or erase history to roll back UI code. Rotate/re-encrypt back only under a
coordinated maintenance procedure, not a blind environment rollback.

## Verification and evidence

Executed locally on Windows, Node 25.9.0 / installed Next 16.4.0:

| Gate | Result |
| --- | --- |
| `npm ci` | Passed; no new dependency added |
| `npm run lint` | Atendimento passes; 4 existing Inteligencia errors listed below |
| `npm run typecheck` | Passed for both applications |
| `npm test` | Atendimento 776 passed / 135 skipped; Inteligencia 438 passed / 15 skipped |
| Local PostgreSQL suites | 150 passed across operator, MFA and AI suites |
| `npm run build:atendimento` | Passed, with the connector unchanged |
| `npm run build:inteligencia` | Passed, with the connector unchanged |
| `npm audit --omit=dev --audit-level=high` | Passed, 0 production dependency findings |
| `npm run audit:perf` | Passed; static findings retained for separate review |
| Browser responsive/interaction matrix | 50 layouts, 320/390/768/1024/1440 px |

Node 25's experimental native webstorage conflicts with the existing jsdom
fixtures. Tests used `NODE_OPTIONS=--no-experimental-webstorage`; no application
storage/auth code was changed for this environment issue.

The separate PostgreSQL fixture uses localhost:55484 and disposable databases,
never production connections. Those tests are skipped in the ordinary run and
were executed separately with guarded local fixture URLs.

The local browser harness in `apps/atendimento/tests/visual-review` mounts real
production components with an explicitly labeled synthetic transport. It is not
a production mock screen or authentication bypass. Start it after an Atendimento
build with `node apps/atendimento/tests/visual-review/server.mjs` (loopback:3042).
`checks.mjs` exports `check(page, evidenceDirectory)` for a Playwright page. It
checks overflow, dialog bounds, focus restoration, base search/selection,
coverage pagination/save, transfer justification/Escape, unavailable money,
unchanged automation flags, canceled paid tests and secret clearing on logout.

See [responsive results](evidence/atendimento-ux-ai/responsive-checks.json) and
the 20 synthetic desktop/mobile PNG captures beside that file. Native browser
evidence and actual SQL integration tests complement each other; they are not
authenticated production E2E or live provider/WhatsApp homologation.

Existing global lint failures (unchanged source):
`apps/inteligencia/components/privacy-consent.tsx:19`,
`components/security/mfa-login-modal.tsx:23`,
`components/security/mfa-security-panel.tsx:48`,
`components/views/pnr-inbox-view.tsx:333` under the same application.
All four are `react-hooks/set-state-in-effect`. Atendimento retains 3 existing
unused-variable warnings. These are not hidden or automatically repaired here.

`npm audit` reports 9 existing tooling dependency findings (6 high, 3 moderate),
in the ESLint/glob and Vitest trees. No lockfile dependency upgrade or unsafe
`audit fix` was performed; review these separately before release. The production
dependency audit separately reports 0 vulnerabilities.
Live provider billing, authenticated Mercado Livre/installed Chrome behavior,
automatic key rotation and production deployment remain unverified/not performed.
