# Migrations And RLS Runbook

This repository uses Drizzle for schema definitions and a single consolidated Supabase RLS file.

## Sources Of Truth

- Schema: `src/db/schema/index.ts`
- Generated Drizzle migrations: `drizzle/`
- RLS policies: `supabase/rls-consolidated.sql`

Deprecated RLS files such as `supabase/rls.sql` and `supabase/rls-policies.sql` are historical references only. Do not apply them to a live environment.

## Local Checks

```bash
pnpm db:generate
pnpm validate:rls
pnpm audit:api-routes
pnpm typecheck
pnpm lint
pnpm test -- --run
```

## Applying Changes

1. Update Drizzle schema files.
2. Generate a migration with `pnpm db:generate`.
3. Update `supabase/rls-consolidated.sql` when table access rules change.
4. Run `pnpm validate:rls` and review missing tables.
5. Apply migrations and RLS in staging before production.

## API Route Audit

`pnpm audit:api-routes` prints a JSON inventory of every `src/app/api/**/route.ts` file, including methods, auth classification, rate limiting, response standardization, and service-role usage.

Use `pnpm audit:api-routes:strict` when you want CI to fail on mutating routes whose auth classification is unknown.
