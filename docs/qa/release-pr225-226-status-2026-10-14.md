# Estado de PRs de release #225 y #226 — 14-10-2026

## Hallazgos

- **PR #225:** abierto, no draft, no mergeado. Head remoto
  `f68ec68d140868fb5f0df0f1d4571d35665af3fb`; base `main` en
  `aac785213a9d3678c6215da62ef4e9f6931d3163`. No hay reviews enviadas; la
  revisión de `@elvisvaldes` está solicitada y pendiente.
- **PR #226:** abierto, draft, no mergeado. Head remoto
  `1182f0c611e54bb44d8749705d6a07bad3fde19b`; misma base `main`. No hay
  reviews enviadas ni reviewer solicitado.
- El candidato probado localmente, `d6ac32654c0faa506212cb1eb21a677207069947`,
  **no existe en GitHub** (API devuelve “No commit found”). La comparación
  local entre `1182f0c` y `d6ac326` da 0 commits por delante en `1182f0c` y
  60 commits por delante en `d6ac326`, con 52 archivos distintos. Por tanto,
  no hay CI remoto asociado a `d6ac326`; los PASS locales no validan el head
  remoto `1182f0c`.

## Matriz de checks observados

| PR / SHA remoto | Check | Estado observado | Clasificación |
|---|---|---|---|
| #225 / `f68ec68` | CI `38349080282` | Success; lint/tipos, unit, build, RLS, migraciones y E2E autenticado pasaron | Jobs normales de PR: PASS |
| #225 / `f68ec68` | Static Gates `38349080308` | Success | PASS |
| #225 / `f68ec68` | Vercel | Success | PASS; no sustituye review ni schema gate |
| #226 / `1182f0c` | CI `38491147838` | Success global; unit, build, lint/tipos, RLS, migraciones, credenciales y E2E autenticado pasaron | Jobs normales de PR: PASS |
| #226 / `1182f0c` | Experimental E2E local Owner | Failure | `continue-on-error: true` en el workflow: fallo permitido, no bloquea la conclusión global de CI |
| #226 / `1182f0c` | Smoke, Lighthouse, E2E Public | Skipped | Condicionados a push a `main`; no son checks ejecutados en este evento PR |
| #226 / `1182f0c` | Static Gates `38491147841` | Success | PASS |
| #226 / `1182f0c` | Directory integrity `38491147836` | Success | Migración, restore, RLS y concurrencia en PostgreSQL temporal: PASS |
| #226 / `1182f0c` | Vercel | Success | PASS; no prueba compatibilidad de schema del destino |

En `1182f0c`, el E2E autenticado ejecuta `tests/e2e-owner-dashboard.spec.ts`,
según `package.json`; no es el E2E local de operaciones Owner probado en
`d6ac326`. La corrida experimental local de `1182f0c` sí terminó en failure,
pero está expresamente tolerada por `continue-on-error`.

El conector de GitHub permitió leer jobs, estados y reviews, pero no expuso las
reglas de branch protection. La etiqueta “normal de PR” describe el `if` y
`continue-on-error` del workflow, no una afirmación sobre qué checks están
marcados como required en Settings.

## Schema y decisión

Main reporta en el checkout local integrado `e0eb` la suite Chromium/Firefox/
WebKit y restore local en PASS. Ese SHA y esos resultados no están publicados
en GitHub. El job remoto Directory integrity valida contra una base temporal;
no demuestra que el schema del destino del release sea compatible ni que las
migraciones estén aplicadas allí.

**Veredicto: NO-GO.** El head publicado de #226 continúa en `1182f0c`, 60
commits detrás del candidato local `d6ac326`; #226 sigue draft y sin aprobación,
y #225, gate independiente, sigue abierto con review pendiente. Mantener NO-GO
hasta validar el schema del destino, tener CI del candidato que se pretende
publicar y recibir aprobación humana.

## Evidencia GitHub

- [PR #225](https://github.com/mentessaas/Zaltyko/pull/225)
- [CI #225 — run 38349080282](https://github.com/mentessaas/Zaltyko/actions/runs/38349080282)
- [Static Gates #225 — run 38349080308](https://github.com/mentessaas/Zaltyko/actions/runs/38349080308)
- [PR #226](https://github.com/mentessaas/Zaltyko/pull/226)
- [CI #226 — run 38491147838](https://github.com/mentessaas/Zaltyko/actions/runs/38491147838)
- [Static Gates #226 — run 38491147841](https://github.com/mentessaas/Zaltyko/actions/runs/38491147841)
- [Directory integrity #226 — run 38491147836](https://github.com/mentessaas/Zaltyko/actions/runs/38491147836)
- [Workflow CI en el head remoto `1182f0c`](https://github.com/mentessaas/Zaltyko/blob/1182f0c611e54bb44d8749705d6a07bad3fde19b/.github/workflows/ci.yml)
- [`package.json` en `1182f0c`](https://github.com/mentessaas/Zaltyko/blob/1182f0c611e54bb44d8749705d6a07bad3fde19b/package.json)
