# Phase 3A - Quality Automation And Legacy Retirement

## Scope

Phase 3A establishes automation and retires the old static dashboard runtime. It does not add operational modules, change business rules, alter Supabase schema/data, or change Vercel project settings.

## CI

Workflow: `.github/workflows/ci.yml`

Triggers:

- `pull_request` to `main`
- `push` to `main`
- `workflow_dispatch`

Quality job:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test:rules`
- `npm run check:metadata`
- `npm run check:scripts`
- `npm run check:ci-env`
- `npm run build`
- `npm run audit:ci`
- `npm run test:e2e:smoke`

The workflow uses `actions/checkout`, `actions/setup-node`, official npm cache through setup-node, minimal `contents: read` permissions, and concurrency cancellation by branch/ref.

Required CI configuration:

- `NEXT_PUBLIC_SUPABASE_URL` as a GitHub Actions repository variable
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a GitHub Actions repository variable

These values are public frontend configuration. They intentionally use repository variables so normal PRs and Dependabot PRs can build without private secrets.

Optional database audit configuration:

- `SUPABASE_DB_URL` as a GitHub Actions repository secret

No `service_role` key is required for frontend CI. The normal Quality Gate does not receive `SUPABASE_DB_URL`.

## Audit Groups

`npm run audit:ci` runs only static/offline audits and is safe for PRs and Dependabot:

- `audit:dashboard`: static/offline source and runtime guard checks
- `audit:dead-code`: static/offline source heuristic

`npm run audit:db` runs PostgreSQL read-only audits and requires `SUPABASE_DB_URL`:

- `audit:module-isolation`
- `audit:dedupe`
- `audit:row-counts`
- `audit:raw-data`
- `audit:supabase`

`npm run audit:all` remains for local/admin validation and runs both groups.

The GitHub `database-audit` job runs only outside pull requests. If `SUPABASE_DB_URL` is missing, it emits a notice and skips the database audit commands.

## E2E

Playwright is configured in `playwright.config.ts`.

Public smoke tests in `tests/e2e/smoke.spec.ts` always run without credentials:

- `/login` renders title, brand, email, password, remember-session checkbox, button, favicon, and password visibility toggle.
- Anonymous access to `/`, `/dashboard`, `/pre-fatura`, `/gestao-pacotes`, `/desvios-pnr`, `/pacotes-faltantes`, `/perfil`, and `/configuracoes` redirects to `/login?next=...`.

Authenticated tests in `tests/e2e/authenticated.spec.ts` are prepared but conditional:

- `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`: common read-only journey.
- `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`: admin configuration visibility only.

If credentials are absent, authenticated tests skip with an explicit message. They do not create users, import files, update records, delete files, change targets, or alter permissions.

## Metadata

Root metadata in `app/layout.tsx` owns the title suffix template:

```ts
template: `%s | ${BRAND.productName}`
```

Page metadata must provide only the page title, such as `Login` or `Dashboard`. `scripts/check-metadata-titles.mjs` fails if a page title includes `ALC Admin Center` directly.

The confirmed production bug:

```txt
Login | ALC Admin Center | ALC Admin Center
```

is corrected to:

```txt
Login | ALC Admin Center
```

## 404 And Errors

`app/not-found.tsx` provides a PT-BR ALC branded 404 screen.

`app/error.tsx` and `app/global-error.tsx` keep generic PT-BR error states and do not expose stack traces.

## Legacy Retirement

The retired static runtime and browser XLSX bundles were removed:

- old static dashboard files
- old global auth/config/cache scripts
- old Railway static dashboard server
- browser vendor XLSX bundles
- `npm run check:legacy`

Git history remains the archive. No `backup/`, `old/`, or duplicate legacy copy was created.

## Backfill PNR

`scripts/backfill-pnr-records.mjs` now uses server-side `exceljs` directly instead of `assets/vendor/xlsx.full.min.js`.

Dry-run mode:

```powershell
node scripts/backfill-pnr-records.mjs --dry-run
```

Dry-run authenticates, lists candidate files, downloads them, and normalizes workbook rows. It skips deletes, inserts, dashboard file metadata updates, processed file upserts, and metric refresh RPCs.

## Railway

Kept:

- connection check
- schema dry-run/apply script for Railway staging
- Supabase export
- Railway import
- Supabase/Railway compare
- logical dashboard validation
- sizing check

Removed:

- static dashboard server that served the old HTML frontend

Railway remains outside the normal Vercel runtime.

## Dependency Audit

`npm ls exceljs uuid` currently resolves:

- `exceljs@4.4.0`
- transitive `uuid@8.3.2`

`npm audit --omit=dev` reports two moderate vulnerabilities through `uuid`. The only npm-proposed fix is a breaking downgrade path for `exceljs`, so Phase 3A does not force an unsafe dependency change.

Mitigation:

- ExcelJS is used server-side for exports/import parsing, not as an initial browser bundle.
- Old browser vendor XLSX bundles were removed.
- Dependabot is enabled weekly for npm and GitHub Actions without auto-merge.

## Row Count Contract

The reconciliation audit preserves:

- `PRE_FATURA mismatches = 0`
- `GESTAO_PACOTES mismatches = 0`
- `DESVIOS_PNR` exactly four historical metadata mismatches by file and counts
- `PACOTES_FALTANTES mismatches = 0`

No Supabase schema, RLS, or data mutation is part of this phase.

The shared audit database helper opens PostgreSQL connections with `default_transaction_read_only=on` unless a script is explicitly executed with `--apply`.

## Production Smoke

`npm run verify:runtime -- <url>` checks that a URL serves the Next.js runtime and does not serve old legacy signals.

`npm run smoke:production -- <url>` checks `/login` and anonymous private-route redirects without attempting authentication.
