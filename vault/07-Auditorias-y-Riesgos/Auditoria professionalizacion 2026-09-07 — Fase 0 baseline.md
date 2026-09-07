---
type: audit-fase
status: in-progress
phase: 0 (Setup + baseline)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
politica: ZAL-169 (antifabricación) activa — toda evidencia debe pasar por `git rev-parse --verify <sha>` y peer-verification donde aplique
---

# Fase 0 — Baseline + Setup

> Modo del documento: **literal** (cada número con comando reproducible).
> No es informe de hallazgos: es foto del repo al 2026-09-07.

## 1. Branch target

Auditoría ejecutándose sobre:

- **Branch actual**: `fix/r2-csp-nonce-hydration-2026-09-07` (HEAD `faa3400c3fba566e071398e8f328170a69428be7`)
- **main**: `df832ab5 merge(zal770-recovered): product fixes, motion, dashboard dark mode, business logic`

**Divergencia detectada**: el branch actual está **adelante** de `main` por ~21 commits que contienen la cadena R1+R2 del 2026-09-07 (CSP nonce propagation, Playwright 1.63.0 skew, gate Sentry por VERCEL_ENV, etc.).

**Decisión operativa** (CEO pendiente de confirmar en Q5):
auditamos el branch actual porque contiene las correcciones P0 de seguridad más recientes. Cuando R2 se mergee a main, repetimos Fase 0 sobre main para alinear.

## 2. Métricas de escala

| Métrica | Valor | Comando |
|---|---|---|
| Commits totales en branch | 255 | `git rev-list --count HEAD` |
| Commits desde auditoría consolidada (2026-07-03) | 255 | `git log --since="2026-07-03" --oneline \| wc -l` |
| Commits desde última P&S review (2026-08-26) | 46 | `git log --since="2026-08-26" --oneline \| wc -l` |
| API routes (`src/app/api/**/route.ts`) | 307 | `find src/app/api -name "route.ts" \| wc -l` |
| Rutas con `withTenant` | 217 | `grep -rl "withTenant" src/app/api --include="route.ts" \| wc -l` |
| Rutas con `withSuperAdmin` | 12 | `grep -rl "withSuperAdmin" src/app/api --include="route.ts" \| wc -l` |
| Rutas con `withBearerTenant` | 1 | `grep -rl "withBearerTenant" src/app/api --include="route.ts" \| wc -l` |
| Rutas con `withAuthenticatedNoTenant` | 1 | `grep -rl "withAuthenticatedNoTenant" src/app/api --include="route.ts" \| wc -l` |
| Rutas con `apiSuccess`/`apiCreated`/`apiError` | 272 (88.5%) | `grep -rl "apiSuccess\|apiCreated\|apiError" src/app/api --include="route.ts" \| wc -l` |
| Schemas Drizzle | 90 | `find src/db/schema -name "*.ts" \| wc -l` |
| Tests (`*.test.ts` + `*.spec.ts`) | 342 | `find . -name "*.test.ts" -o -name "*.spec.ts" \| grep -v node_modules \| wc -l` |
| Archivos TS/TSX (excl. node_modules, .next) | 3493 | `find . \( -name "*.ts" -o -name "*.tsx" \) \| grep -v node_modules \| grep -v .next \| wc -l` |

**Comparación con auditoría 2026-07-03** (referencia):
- Rutas API: 265 → **307** (+42, +15.8%)
- Auth wrappers (withTenant + variantes): ~265 → **231** (+0; pero ahora cubren 75.2% de 307 vs ~100% de 265 ⇒ ratio real **bajó**)
- Schemas: 68 → **90** (+22, +32%; refleja módulos marketplace, onboarding, family portal, etc.)
- Tests: 162 → **342** (+180, +111%; refleja suites focal + ZAL-770 SHA-1 + ZAL-1096 rate-limit + ZAL-1110 SEO + ZAL-984 mock auth + recovery handoff + ZAL-336 UTM)

⚠ **Lectura honesta**: el ratio de cobertura de auth (75.2%) bajó en términos relativos aunque subió en absolutos. Las 76 rutas sin wrapper **deben** ser excepciones justificadas (webhooks con firma, cron, públicos+rate-limit, session-scoping con `auth.getUser`, token-based HMAC, MCP, debug). **D1 se encarga de validarlas una por una**.

## 3. Configuración TypeScript (`tsconfig.json`)

```jsonc
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    ...
    // ⚠ FALTAN:
    // "noUncheckedIndexedAccess": true  → atrapa arr[i] cuando i puede ser undefined
    // "exactOptionalPropertyTypes": true → distingue undefined vs prop faltante
  }
}
```

`strict: true` está activo desde el inicio. Las dos flags adicionales **no** lo están. Esto es una superficie latente de bugs (acceso a array index, propiedades opcionales que aceptan `undefined` cuando no deberían). **D4 los aborda**.

## 4. Rutas sin wrapper — sample categorizado

Listado parcial (30/76), pendiente categorización completa en D1:

| Ruta | Justificación esperada |
|---|---|
| `/api/preferences` | pública + rate-limit (preferencias de usuario) |
| `/api/contact` | pública + rate-limit (formulario de contacto) |
| `/api/athletes/invite/state/[stateToken]` | token-based (HMAC state token) |
| `/api/athletes/invite/complete-profile` | token-based |
| `/api/empleo/[id]/apply` | pública + rate-limit |
| `/api/empleo/mis-postulaciones` | session-scoping (`auth.getUser`) |
| `/api/plans` | pública (planes de pricing) |
| `/api/lemonsqueezy/webhook` | webhook signature |
| `/api/auth/check` | pública (health session) |
| `/api/user-preferences/email` | session-scoping (`auth.getUser`) |
| `/api/leads` | pública + rate-limit |
| `/api/health` | pública (healthcheck) |
| `/api/marketplace/*` (4 rutas) | pública listings + session-scoping |
| `/api/family/*` (6 rutas) | session-scoping (`auth.getUser`) |
| `/api/admin/verify-supabase` | debug/admin |
| `/api/mcp` | MCP tool (auth por context) |
| `/api/docs` | pública |
| `/api/unsubscribe` | token-based HMAC |
| `/api/growth/events` | pública (analytics intake) |
| `/api/super-admin` | debug/test |
| `/api/public/clusters`, `/api/public/academies/filter-options` | pública (SEO) |

## 5. Changelog delta (2026-07-03 → 2026-09-07)

Entradas representativas del período (Changelog interno.md 916KB, 50+ entradas en el rango):

- **2026-09-07**: R2 cerrado (CSP nonce propagation, PR #110) — P0 real, no P1.
- **2026-09-07**: R1 cerrado (Playwright 1.63.0, PR #108).
- **2026-09-05**: ZAL-Tracking-Paid (Google Ads + signup_completed, sin merge).
- **2026-09-04**: ZAL-1091 disposition `blocked` (Board mantiene gate global).
- **2026-09-04**: ZAL-984 QA peer verification de ZAL-336 con veredicto adverso (FAIL local).
- **2026-09-04**: ZAL-1110 SEO fail-closed de academias terminales.
- **2026-09-04**: ZAL-800 WhatsApp UI secrets removidos.
- **2026-09-04**: ZAL-575 Tier A WCAG AA contrast (mobile).
- **2026-09-02**: ZAL-1096 rate-limit por address hash en bajas y preferencias.

**Lectura**: el equipo ha estado focused en cerrar gaps P0 (seguridad, authz, hydration, SEO) y P1 (rate-limit, WCAG, secrets). **D3 (P1)** retoma los pendientes del P&S review 2026-08-26.

## 6. Confirmación de política antifabricación (ZAL-169)

Activa desde 2026-08-01 (vault/06-Roadmap-y-Tareas/Decisiones.md). Reglas que aplican a esta auditoría:

1. **Resolución literal obligatoria**: todo SHA mencionado debe pasar `git rev-parse --verify <sha>`.
2. **Peer-verification cruzada** cuando el autor del claim ≠ agente que verifica.
3. **Recovery handoff NO rehabilita cierres** (ZAL-90 C-4).
4. **codeRepoPaths poblado antes de aceptar `done`** (ZAL-88).
5. **SHA fabrication = incidente de control** (5 casos backfilled: ZAL-40/62/63/7/8/70/71/73/74; + ZAL-801/648/172 adicionales).
6. **"no se pudo reproducir"** preferible a fix plausible-pero-incorrecto.

Para esta auditoría: cada hallazgo de Fase 1+ debe adjuntar SHA del commit que introdujo el código auditado, ruta de archivo exacta, y cuando sea remediación, propuesta antes de aplicar.

## 7. Riesgos identificados del baseline

1. **Branch divergence**: si el CEO prefiere auditar `main`, perdemos los fixes R1+R2 del branch actual. Mitigación: repetir Fase 0 post-merge.
2. **Ratio de auth wrappers bajó**: 75.2% es correcto sólo si las 76 excepciones están justificadas — **D1 confirma**.
3. **TS strictness incompleto**: `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` off. Mitigación: D4 mide blast radius antes de recomendar activar.
4. **TS/TSX count 3493** parece alto vs los 1434 citados en el plan — el conteo incluye `mobile/`, `zaltyko-branding/` que el `exclude` de tsconfig.json ignora pero el `find` shell incluye. **Aclarar en D4**.

## 8. Próximos pasos (Fase 1)

- **D1 (Re-adherencia a patrones)**: categorizar las 76 rutas sin wrapper. Para cada ruta nueva desde 2026-07-03, validar `withTenant` (o equivalente) + `apiSuccess`/`apiCreated`/`apiError` + Zod validation.
- **D2 (GDPR Art. 8 + datos de menores)**: revisar modelo de datos para menores (consentimiento, parent-guardian binding, age verification), ZAL-324 Gap 5 implementación, DPA Supabase EU North pendiente, retention policies.

---

**Próxima entrega**: Fase 1 — D1 + D2.
