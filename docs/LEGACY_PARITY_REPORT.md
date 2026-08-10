# Legacy Parity Report

## Status

Legacy runtime: **RETIRED**.

The production application is the Next.js App Router runtime. The retired static dashboard files and old browser vendor bundles were removed from the repository in Phase 3A. Git history remains the source for historical recovery.

## Removed Runtime Surface

- Static HTML/CSS/JS dashboard from `legacy/`.
- Browser globals from the old runtime: `window.supabaseClient`, `authService.js`, `config.js`, and `dashboardCacheService.js`.
- Browser vendor XLSX bundles from `assets/vendor/`.
- Legacy Railway/static dashboard server script.
- `npm run check:legacy`.

## Preserved Modern Runtime

- `app/`: Next.js App Router pages, layouts, API routes, loading states, errors, and not-found.
- `components/`: shell, primitives, feedback, filters, tables, charts, and brand components.
- `features/`: operational modules organized by feature.
- `lib/`: Supabase, auth, permissions, constants, server helpers, and exports.
- `public/brand/`: official ALC assets used at runtime.

## Business Parity Preserved

Critical rules remain in the modern feature modules and rule tests:

- Pré-Fatura requires real package and route identity.
- Different package/shipment IDs are never merged only by route, value, driver, plate, base, or date.
- Total, subtotal, footer, and identity-less rows do not enter calculations.
- Gestão de Pacotes ignores total-like rows and preserves operational identity.
- Desvios PNR preserves shipment/case/claim identity and does not use route/value as a unique key.
- Admin authorization requires the central helper rule: `profile.is_admin === true` and normalized `profile.role === "admin"`.
- `user_metadata` is not an authorization source.

## PNR Backfill

`scripts/backfill-pnr-records.mjs` now uses the server-side `exceljs` package directly. It no longer depends on a browser XLSX bundle.

Use dry-run for validation:

```powershell
node scripts/backfill-pnr-records.mjs --dry-run
```

Dry-run downloads and normalizes candidate files but skips deletes, inserts, metadata updates, and RPC refreshes.

## Railway

Railway database migration, export, import, compare, validate, sizing, and dry-run scripts remain because they are not the retired frontend runtime. The removed piece was only the old static dashboard server.

## Row Count Reconciliation

The reconciliation audit keeps the known contract:

- `PRE_FATURA`: `mismatches = 0`
- `GESTAO_PACOTES`: `mismatches = 0`
- `DESVIOS_PNR`: exactly four historical metadata mismatches, identified by file and counts
- `PACOTES_FALTANTES`: `mismatches = 0`

Any new mismatch or changed historical mismatch fails the audit.
