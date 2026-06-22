# Sprint 3 Audit

Fecha: 2026-06-21

## Alcance

- Responsive en `375`, `768`, `1024` y `1280`.
- Accesibilidad WCAG A/AA con `@axe-core/playwright`.
- Smoke E2E ampliado para rutas críticas de academia.
- Revisión de migraciones Drizzle/Supabase y rutas dinámicas.

## Comandos

```bash
pnpm test:e2e
pnpm test:a11y
pnpm audit:sprint3
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Para rutas autenticadas:

```bash
E2E_ACADEMY_ID=<academy-id> E2E_STORAGE_STATE=.auth/user.json pnpm audit:sprint3
```

Si `BASE_URL` no está definido, Playwright inicia `pnpm dev` en `http://127.0.0.1:3000`.

## Evidencia

- Capturas responsive: `test-results/sprint-3/`.
- Reporte HTML Playwright: `playwright-report/`.
- Reporte de migraciones: `docs/migrations-backlog.md`.

Los artefactos pesados no se versionan por defecto; el repo guarda la configuración reproducible y este checklist.

## Checklist Sprint 3

- [x] Configuración Playwright añadida.
- [x] `@axe-core/playwright` añadido como dependencia dev.
- [x] Scripts `test:e2e`, `test:a11y` y `audit:sprint3` añadidos.
- [x] Smoke E2E ampliado en `tests/e2e-zaltyko-full.spec.ts`.
- [x] Auditoría a11y automatizada en `tests/a11y-zaltyko.spec.ts`.
- [x] Fix responsive puntual en dashboard legacy.
- [x] Fix de nombres accesibles en botones icon-only del topbar legacy.
- [x] Token teal de marca ajustado a contraste WCAG AA para texto y botones.
- [x] Revisión inicial de rutas `force-dynamic` documentada.
- [x] Changelog Supabase revisado antes de migraciones.
- [ ] Migración remota aplicada. Bloqueada por `SELF_SIGNED_CERT_IN_CHAIN` en la conexión Postgres; corregir CA/sslmode de `DATABASE_URL` antes de reintentar.
