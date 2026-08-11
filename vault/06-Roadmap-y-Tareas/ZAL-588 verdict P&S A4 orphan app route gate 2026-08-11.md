# ZAL-588 verdict P&S — cierre de fuga anónima /app/admin/dashboard + A4 gate

**Owner del verdict:** Platform & Security (agent 6909a098)
**Fecha:** 2026-08-11
**Issue:** ZAL-588 [F0 P0] Contener fuga anónima del panel huérfano /app/admin/dashboard
**Parent:** ZAL-587 (Board: reforma del panel super-admin — fuga de datos P0) — done
**Commits (branch gates/ZAL-556):**

- `69bcfdc85` — fix(gates): quitar /app/admin huérfano y endurecer A4 gate (ZAL-588)
- `f620fb49f` — fix(gates): tolerar archivos iCloud dataless en walker (errno -11)

---

## Resumen

El server component `src/app/app/admin/dashboard/page.tsx` realizaba queries anónimas
a `academies`, `plans`, `subscriptions` y `athletes` desde `/app/admin/dashboard`,
sin `supabase.auth.getUser`, sin `redirect`, sin wrapper `withTenant`/`withSuperAdmin`,
sin layout padre. Cualquier visitante no autenticado recibía HTML con métricas
operativas y monetización. ZAL-587 (parent) decidió la reforma completa del panel;
ZAL-588 cierra la fuga inmediata sin esperar esa reforma.

## Acciones aplicadas

1. **Borrado del archivo huérfano.** `src/app/app/admin/dashboard/page.tsx`
   fuera del árbol y del index. Una petición anónima a `/app/admin/dashboard`
   produce 404 en cuanto el deploy recoge el commit.

2. **A4 gate estático (`scripts/gates/orphan-app-route.ts`).** Detecta por AST
   (TypeScript compiler API, no regex) cualquier `page.tsx` bajo
   `src/app/app/<static>/...` que no tenga auth primitive en la propia página
   o en un layout.tsx padre. Whitelist explícita: `src/app/app/page.tsx`
   (root landing con `/api/auth/check`) y todo `src/app/app/[academyId]/...`
   (cubierto por `[academyId]/layout.tsx`). Escape hatch:
   `// @orphan-app-route-ok reason: <texto>` justo antes del export.
   Auth primitives reconocidos: `withTenant`, `withSuperAdmin`,
   `resolveUserId`, `getBearerToken`, `createBearerSupabaseClient`,
   `assertSuperAdmin`, `getCurrentProfile`, `verifyWebhookSignature`,
   `getDevSessionFromCookieStore`, `redirect`, `supabase.auth.getUser`,
   `supabase.auth.getSession`, `fetch("/api/auth/check", ...)`.

3. **Integración en `pnpm gate:all` y `pnpm gate:orphan`/`gate:orphan:strict`**.
   A4 corre junto a A2 y A3 en el entrypoint de CI.

4. **Self-tests con cobertura negativa y positiva.** 4 fixtures negative
   (no-auth directo, no-layout, whitelist-shaped-but-bare, parent con
   layout OK) y 4 fixtures positive (whitelist `[academyId]`, page-auth,
   escape hatch, root landing). El entrypoint de `run-all` se ejercita
   contra los dos fixtures para que un runner que no pueda lanzar sus
   children no se disfrace de OK — esa regresión ya rompió `gate:all`
   dos veces según la nota del walker.

5. **Walker tolerante a iCloud dataless.** `tryReadSource` + `safeScanFile`
   en `scripts/gates/lib/walker.ts` para que un único archivo dataless
   (errno -11) no tumbe la corrida. Previamente A2 y A3 morían a mitad
   de `pnpm gate:all` sobre el working copy real.

## Verificación

| Comando | Resultado |
| ------- | --------- |
| `pnpm gate:orphan --strict` sobre `src/app/app/` | 63 files, 0 findings |
| `pnpm gate:orphan --strict --root fixtures/positive` | 0 findings |
| `pnpm gate:orphan --strict --root fixtures/negative` | 3 findings (ZAL-588 leak shape + variantes) |
| `pnpm gate:test` | 14/14 pass (A2/A3/A4 positive+negative + entrypoints CI) |
| `pnpm gate:all` (repo real) | corre hasta el final; A4 0/63; A2 y A3 ahora pueden reportar hallazgos reales (antes morían en dataless) |

Búsqueda residual tras el borrado:

- `git grep -nE "app/admin" HEAD -- src/ tests/ scripts/ docs/ vault/` —
  cero coincidencias en `src/` y `tests/`. Coincidencias solo en
  `vault/06-Roadmap-y-Tareas/ZAL-544-verdict-2026-08-10.md` (verdict
  histórico, no live) y en `docs/audit/ROUTES_AND_SCREENS.md` (que ya
  tiene un diff uncommitted de otra heart que remueve la línea y
  ajusta el contador de 32 a 31; preservado intacto, no es ZAL-588).

## Separación local/sandbox vs producción

- **Local + sandbox:** verificado vía `pnpm gate:orphan:strict` (sin
  red, sin DB, sin dominios). No requiere Stripe, Supabase ni
  ningún secreto. Las queries del archivo borrado no se vuelven a
  ejecutar: no hay nada que ejecutar.
- **CI:** `pnpm gate:all` falla en CI si alguien añade un page.tsx
  huérfano (negative fixtures romper).
- **Producción:** este PR no toca producción. El cambio efectivo
  en producción requiere el deploy normal. Antes del deploy, una
  petición a `/app/admin/dashboard` en el entorno actual sigue
  sirviendo el dashboard; tras el deploy, devuelve 404. **No
  he aplicado el deploy** — eso es decisión del board.
- **Stripe / live / datos reales:** no aplica. El archivo borrado
  leía `academies`, `plans`, `subscriptions`, `athletes` — todas
  son tablas operativas; ningún secret, ninguna variable de
  entorno, ningún dato personal sintético o real entra ni sale
  por este PR.

## Riesgo transversal de authz observado (NO se aborda en este PR)

Al hacer el walker tolerante a dataless, A3 ahora puede correr hasta
el final y reportar 3 handlers bajo `src/app/api/` que validan body
antes de auth:

- `src/app/api/empleo/[id]/apply/route.ts:41` — POST
- `src/app/api/contact/route.ts:24` — POST
- `src/app/api/athletes/invite/complete-profile/route.ts:71` — POST

Estos preexisten a ZAL-588 (no introducidos por este PR). Son
candidatos a un PR separado de Engineering Lead con la corrección
`withTenant`/`withSuperAdmin` o el `// @auth-flexible` documentado.
Los dejo en radar; no acciono acá porque la issue ZAL-588 es sobre
la fuga de `/app/admin/dashboard`, no sobre API routes.

## Hallazgo para F2 (no acciona en este PR)

`getEstimatedMRR` en el archivo borrado sumaba `plans.priceEur`
sin documentación explícita de la unidad. Antes de reintroducir
métricas administrativas en `(super-admin)/super-admin/` u otra
ruta, F2 debe confirmar con la fuente de datos si `priceEur` está
en euros o céntimos. Este PR **no cambia pricing ni datos remotos**.

## Criterios de aceptación

| Criterio | Estado |
| -------- | ------ |
| Anonymous request to `/app/admin/dashboard` no entrega HTML del panel | OK tras deploy (en local el path no existe) |
| `grep`/fixture confirma cero refs a `app/admin`; nuevo leak rompe CI | OK — A4 fixture negative detectaría |
| El diff no introduce datos sintéticos ni pretende ser validación de producción | OK — solo borrado + gate + walkers |
| Decisión sobre `plans.priceEur` (eur/cent) solo como hallazgo para F2; no cambiar pricing | OK — riesgo anotado para F2 |

## Trabajo paralelo preservado

`git status --short` muestra todavía sin stage los cambios de
ZAL-556/ZAL-587 (billing, tests, vault, ROUTES_AND_SCREENS.md) y
los archivos untracked de research/security. Esos los sigue
commiteando el agente correspondiente; este PR no toma ninguno.
