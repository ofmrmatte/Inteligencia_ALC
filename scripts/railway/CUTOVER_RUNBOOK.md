# Railway controlled cutover runbook

This runbook prepares the final snapshot and controlled cutover to Railway without executing it automatically.

## Current target architecture

- Supabase Auth remains responsible for login and session validation.
- Railway Postgres stores operational dashboard data.
- Server-side API validates Supabase tokens before querying Railway.
- `RAILWAY_DATABASE_URL` must exist only in the backend/API environment.

## Operational freeze

Set:

```bash
OPERATIONAL_FREEZE=true
```

When enabled, reads stay available and operational writes are blocked.

Blocked in the browser:

- file upload and import;
- file/data deletion;
- PNR status edits;
- Missing Packages case status edits;
- Missing Packages Meli contact edits;
- resend/reprocess actions that would write operational data.

Blocked in the Railway API/backend:

- generic `insert`, `upsert`, `update`, and `delete` proxy calls;
- write RPCs such as `update_desvios_pnr_status` and `refresh_desvios_pnr_metrics_summary`;
- module endpoints ending in `/delete`, `/import`, `/reprocess`, `/update-status`, or `/update-contact`.

The backend returns `423 Locked` with:

```txt
Painel em janela de manutencao. Consultas seguem disponiveis, mas alteracoes estao temporariamente bloqueadas.
```

The UI shows the user-facing message:

```txt
Painel em janela de manutenção. Consultas seguem disponíveis, mas alterações estão temporariamente bloqueadas.
```

## Final snapshot procedure

Run only inside the approved maintenance window.

1. Announce maintenance.
2. Enable `OPERATIONAL_FREEZE=true` in the staging/production backend environment.
3. Confirm writes are blocked with a direct API smoke test.
4. Confirm no import/status/delete operation is currently running.
5. Export a fresh Supabase snapshot:

```bash
npm run railway:export -- --apply
```

6. Import the fresh snapshot into Railway:

```bash
npm run railway:import -- --apply
```

For a reused staging database, use only when the target is confirmed staging Railway:

```bash
npm run railway:import -- --apply --truncate-railway
```

7. Validate:

```bash
npm run railway:compare
npm run railway:validate
npm run audit:module-isolation
npm run audit:dedupe
npm run audit:dashboard
npm run audit:row-counts
```

8. Run local/staging smoke tests before any production env change.

## Remote preview before production

Create a preview/staging deployment separate from production.

Required public frontend config:

```bash
DATA_SOURCE=railway_preview
RAILWAY_API_URL=https://<railway-api-preview-host>/api
SUPABASE_URL=https://<supabase-project>.supabase.co
SUPABASE_ANON_KEY=<public anon or publishable key>
OPERATIONAL_FREEZE=true
```

Required backend-only config:

```bash
RAILWAY_DATABASE_URL=postgresql://...
OPERATIONAL_FREEZE=true
```

Do not expose `RAILWAY_DATABASE_URL` in `config.js`, HTML, browser console, or any `NEXT_PUBLIC`/public variable.

Preview validation checklist:

- login, logout, login again;
- F5 after login;
- Pre-Fatura cards, filters, table, report, Excel;
- Gestao de Pacotes cards/charts, filters, table, report, Excel;
- PNR summary, paginated table, search, temporal chart, report, Excel;
- Missing Packages table, 48h deadline, report, Excel;
- blocked write attempts return UI warning and backend `423`;
- no critical browser console errors;
- no backend `500`;
- no module-key mixing.

## Production cutover criteria

Production can be considered ready only when all are true:

- local staging passed;
- remote preview passed;
- final Supabase snapshot imported into Railway;
- `railway:compare` passed;
- `railway:validate` passed;
- audits passed;
- `OPERATIONAL_FREEZE` write blocking passed in UI and backend;
- rollback is documented and rehearsed;
- Supabase remains intact.

## Rollback

Keep Supabase untouched as the operational rollback source.

If production cutover fails:

1. Set production data source back to Supabase.
2. Remove or ignore the Railway API URL in production frontend config.
3. Redeploy/promote the previous production deployment.
4. Keep `OPERATIONAL_FREEZE=true` until smoke tests pass.
5. Validate login and all modules against Supabase.
6. Only then disable the freeze and reopen operations.

Do not delete Supabase or clean its data during the cutover window.
