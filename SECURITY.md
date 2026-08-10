# Security

## Secrets

Do not commit `.env`, service role keys, database passwords, Supabase JWT secrets, Vercel tokens, or real user credentials.

The browser runtime may use only the public Supabase URL and anon key through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

`SUPABASE_SERVICE_ROLE_KEY` and direct database URLs are for local administrative scripts or protected CI read-only audits only. They must never be exposed to client components, bundled JavaScript, screenshots, logs, or uploaded fixtures.

## Authentication And Authorization

The application uses Supabase Auth. Admin authorization must use the central helper in `lib/permissions/is-admin-profile.ts`: `profile.is_admin === true` and normalized `profile.role === "admin"` are both required.

Do not use `user_metadata` for authorization decisions.

## Uploads

Spreadsheet uploads must preserve module boundaries and business identity rules. Files are parsed server-side and validated before records are persisted. Tests and CI must not import production spreadsheets, mutate financial records, delete files, alter permissions, or change operational targets.

## Reporting

Open a private GitHub security advisory or a private issue with reproduction steps, impacted route/script, expected behavior, and observed behavior. Do not include secrets, production credentials, or raw customer data.
