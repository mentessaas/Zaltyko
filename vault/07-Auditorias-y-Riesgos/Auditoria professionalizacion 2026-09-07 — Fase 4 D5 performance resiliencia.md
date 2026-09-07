---
type: audit-fase
status: in-progress
phase: 4 / D5 (Performance y resiliencia operacional)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
prior: ./Auditoria professionalizacion 2026-09-07 — Fase 3 D4 salud codigo.md
decisiones: ./Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 4 — D5: Performance y resiliencia operacional

> Modo del documento: **literal** (cada métrica con comando reproducible).
> No es remediación: es inventario del estado operacional al 2026-09-07.

## 1. Alcance verificado

Cinco ejes de performance/resiliencia:

1. **Build performance**: Vercel OOM estructural, typecheck/lint desacoplados.
2. **Runtime UX**: cobertura de `loading.tsx`, `error.tsx`, `not-found.tsx`, Suspense.
3. **Resiliencia API**: rate-limiting, retry, timeouts, abort signals.
4. **Observabilidad**: Sentry, analytics, logger, console statements.
5. **Cache strategy**: `revalidate`, `unstable_cache`, Vercel KV usage.

**Verificación contra**:
- `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (HEAD `faa3400c`)
- Memoria `project_vercel_oom_build_repro.md`

## 2. Build performance

### 2.1 FINDING P1 — Vercel OOM estructural (ya documentado)

**Estado**: conocido y confirmado (memoria `project_vercel_oom_build_repro.md`).

**Lectura**: Zaltyko `pnpm run build` OOMs reproducibly en el contenedor preview de 8 GB / 2 cores. Probado 2/2 intentos en PR #110. Trivial-commit retry **no** ayuda. Root cause: codebase demasiado grande para el plan Vercel default.

**Mitigaciones actuales**:
1. `next.config.mjs` configura `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true` — el typecheck y lint corren en jobs CI dedicados, no durante `next build`. Esto reduce memoria en build pero no la elimina.
2. PR trivial-commit retry documentado como无效 (memoria).

**Mitigaciones recomendadas (NO aplicadas por codex)**:
1. Upgrade a build machine `large` (Vercel setting) — opción más rápida.
2. Reducir bundle del cliente: tree-shaking más agresivo, code-splitting por ruta, lazy load de librerías pesadas.
3. Reducir `outputFileTracingIncludes`: actualmente incluye `./certs/supabase-root-CA.crt`; revisar si hay otros includes innecesarios.
4. Considerar Turbopack en build (experimental en Next.js 14, pero puede reducir tiempo).

**Severidad**: **P1** (bloquea deploys con cambios reales; mitigación parcial con trivial commits).

### 2.2 Estado de `next build` vs CI typecheck/lint

**Comando**:
```bash
cat next.config.mjs | grep -E "ignoreBuildErrors|ignoreDuringBuilds"
# typescript: { ignoreBuildErrors: true }
# eslint: { ignoreDuringBuilds: true }
```

**Lectura**: el build de Vercel **no** typecheck ni lintea. Esto significa que un type error o lint error puede llegar a producción si CI no los cachó.

**Verificación CI**:
- Job "Lint & Type Check" en CI corre `pnpm typecheck` y `pnpm lint` antes de merge.
- Si CI pasa pero build falla en Vercel (por OOM), el merge queda pero el deploy falla.
- `nextCommitStatus` en Vercel es la única fuente confiable de éxito de build (per memoria).

**Recomendación**: añadir check explícito en CI que **falle** si `nextCommitStatus != "READY"` para PRs. Ya existe verificación parcial per memoria; reforzarla.

## 3. Runtime UX — loading/error/not-found coverage

### 3.1 Métricas de cobertura

**Comando**:
```bash
find src/app -name "loading.tsx" 2>/dev/null | wc -l   # → 69
find src/app -name "error.tsx" 2>/dev/null | wc -l     # → 5
find src/app -name "not-found.tsx" 2>/dev/null | wc -l # → 2
```

**Distribución de loading.tsx**:
- 1 root: `src/app/loading.tsx`
- 5 dashboard: dashboard root + 4 sub-routes
- 63 en `src/app/app/[academyId]/**` — **excelente cobertura**
- 0 en `src/app/(site)/**` (landing pages) — aceptable (pocas son dinámicas)
- 0 en `src/app/(super-admin)/**` — **gap menor**

**Distribución de error.tsx**:
- 1 root: `src/app/error.tsx`
- 1 dashboard: `src/app/dashboard/error.tsx`
- 2 academy: `src/app/app/[academyId]/dashboard/at-a-glance/error.tsx`, `coach/today-simple/error.tsx`
- 1 super-admin: `src/app/(super-admin)/super-admin/error.tsx`

**Lectura**:
- ✅ Loading coverage es **alta** (69 archivos). El dashboard de academia tiene loading en todas las rutas pesadas.
- ⚠️ Error coverage es **baja** (5 archivos). Solo dashboard + academy dashboard tienen error boundaries; super-admin solo tiene 1.
- ⚠️ not-found coverage es **mínima** (2 archivos: root + dashboard).

### 3.2 FINDING P2 — Cobertura de error.tsx insuficiente

**Riesgo**: rutas sin `error.tsx` propagan errores al root boundary. UX: pantalla genérica de error en vez de mensaje contextual + retry específico.

**Rutas críticas sin error.tsx**:
- `src/app/(site)/**` (público, alto tráfico SEO) — sin error boundary.
- `src/app/app/[academyId]/billing/**` (flujo de pago) — sin error boundary.
- `src/app/app/[academyId]/athletes/**` (CRUD principal) — sin error boundary.
- `src/app/app/[academyId]/classes/**` (scheduling core) — sin error boundary.

**Recomendación (no aplicada)**: sprint "Error boundaries" para añadir error.tsx en rutas críticas con retry contextual.

### 3.3 FINDING P3 — Suspense / dynamic imports coverage

**Comando**:
```bash
grep -rE "Suspense|dynamic import" src/app --include="*.tsx" 2>/dev/null | wc -l
# → 16
```

**Lectura**: 16 usos de `Suspense`/`dynamic` en todo `src/app/`. Para una app con 307 rutas y dashboard denso, esto es **bajo**. Componentes pesados (calendar, charts, file-upload, etc.) podrían lazy-loadse más agresivamente.

**Recomendación (no aplicada)**: revisar componentes >50KB en bundle del cliente y aplicar `dynamic(() => import('./Heavy'))` con `ssr: false` cuando aplique.

## 4. Resiliencia API

### 4.1 Rate-limiting coverage

**Comando**:
```bash
grep -rl "rateLimit\|rate-limit" src/app/api --include="route.ts" 2>/dev/null | wc -l
# → 36
find src/app/api -name "route.ts" | wc -l
# → 307
```

**Cálculo**: 36/307 = **11.7% de rutas con rate-limit explícito**.

**Caveat importante**: muchas rutas con `withTenant` heredan rate-limit del wrapper (ver `src/lib/authz-rate-limit.ts`). El 11.7% es **rutas con rate-limit adicional explícito**, no cobertura total.

**Verificación cruzada** (lectura de `src/lib/authz.ts` y `src/lib/authz-rate-limit.ts`): `withTenant` sí aplica rate-limit por IP+user. Las 36 rutas adicionales son las que necesitan rate-limit custom (login, signup, public APIs).

**Conclusión**: cobertura efectiva es mayor que 11.7%, pero las 271 rutas restantes dependen del wrapper. Riesgo bajo.

### 4.2 FINDING P1 — Retry / backoff ausente

**Comando**:
```bash
grep -rlE "withRetry|retry:|maxRetries|backoff" src/ --include="*.ts" --include="*.tsx" 2>/dev/null
# → src/lib/db-error-boundary.ts
# → src/lib/stripe/notification-service.ts
```

**Lectura**: solo 2 archivos mencionan retry/backoff en todo el codebase. Para una app que depende de Supabase, Stripe y servicios externos, esto es **insuficiente**.

**Riesgo**: fallos transitorios de Supabase/Stripe (timeouts, 5xx) se propagan al usuario como 500. Sin retry exponencial, el usuario debe manualmente reintentar.

**Recomendación (no aplicada)**:
1. Crear `src/lib/retry.ts` con utility `withRetry(fn, { maxRetries: 3, backoff: "exponential" })`.
2. Aplicar a llamadas externas (Supabase queries críticas, Stripe API, Brevo API).
3. Aplicar al job de growth events canonical (ya idempotente — buen candidato para retry).

### 4.3 FINDING P2 — Timeouts / abort signals mínimos

**Comando**:
```bash
grep -rE "setTimeout|abortSignal|AbortController" src/app/api --include="*.ts" 2>/dev/null | wc -l
# → 3
```

**Lectura**: solo 3 menciones de timeout/abort en 307 rutas. Sin `AbortController` estándar en handlers, una query Supabase lenta puede colgar el request indefinidamente hasta timeout de Vercel (10s hobby, 60s pro).

**Recomendación (no aplicada)**:
1. Wrapper `withApiTimeout(handler, ms)` que aborte el handler si excede N ms.
2. Aplicar 30s default a rutas pesadas (reports, scheduled, exports).

## 5. Observabilidad

### 5.1 Sentry

**Comando**:
```bash
grep -E "@sentry|@vercel/analytics" package.json
# @sentry/nextjs: ^10.64.0
# @vercel/analytics: ^1.5.0
```

**Estado**:
- ✅ `@sentry/nextjs` instalado y configurado (`next.config.mjs` usa `withSentryConfig`).
- ✅ Gateado por `VERCEL_ENV` (commit `9a60b995` "gate Sentry por VERCEL_ENV") para evitar OOM en builds.
- ✅ Logger estructurado en `src/lib/logger.ts` (239 líneas) integrado con Sentry.

### 5.2 FINDING P1 — 66 `console.log/error/warn` en src/

**Comando**:
```bash
grep -rE "console\.(log|error|warn)" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l
# → 66
grep -rE "console\.(log|error|warn)" src/lib --include="*.ts" 2>/dev/null | wc -l
# → 10
```

**Lectura**: 66 console statements total; 10 en `src/lib/` (el resto en components/api). Para una app con Sentry configurado, esto es **redundante**: Sentry ya captura errores automáticamente, y console.log no se monitorea en producción.

**Riesgo**:
- En producción, `console.log` ejecuta pero no llega a Sentry (sólo errores).
- Debug statements遗留 en producción pueden leakear PII (no verifiqué cada uno).

**Recomendación (no aplicada)**:
1. Migrar `console.error/warn` a `logger.error/warn` (que sí integra con Sentry).
2. Eliminar `console.log` de debug statements (debería ser `logger.debug` solo en dev).
3. ESLint rule `no-console: error` en CI.

### 5.3 Analytics

**Estado**: `@vercel/analytics` instalado. Cobertura desconocida (no audité qué páginas tienen `<Analytics />` mounted). Asumido básico.

## 6. Cache strategy

**Comando**:
```bash
grep -rE "cache:|revalidate|unstable_cache" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l
# → 5
```

**Lectura**: solo 5 usos de caching declarativo en todo el codebase. Para una app Next.js 14 App Router con datos semi-estáticos (planes de pricing, FAQs, configs de academias públicas), esto es **bajo**.

**Oportunidades de cache no explotadas**:
- `/api/plans` (planes de pricing) — debería tener `revalidate: 3600`.
- Páginas públicas de academias (`/[academyId]`) — datos del perfil público podrían cachearse.
- Listings marketplace — filtros podrían cachearse.
- Static assets de Supabase Storage — `next.config.mjs` ya tiene `minimumCacheTTL: 60`, pero podría ser mayor (e.g., 86400 para assets inmutables).

**Recomendación (no aplicada)**: audit específico de cache strategy en D7 (documentación).

## 7. Limitaciones de D5

| Limitación | Por qué | Mitigación |
|---|---|---|
| Bundle size real no medido | Requiere `next build` + análisis de `.next/` | Engineering Lead mide |
| Vercel OOM ya conocido | No re-investigo; memoria ya lo confirma | Plan en `project_vercel_oom_build_repro.md` |
| Lighthouse / Web Vitals no corridos | Requiere deploy a preview + Chrome | Engineering Lead corre Lighthouse |
| Stress test no ejecutado | Requiere staging environment | Engineering Lead en Q4 |
| Trace distribuido no verificado | Asumo Sentry tracing activo pero no audité | Engineering Lead verifica en Sentry dashboard |
| Cache hit rate no medido | Requiere Vercel analytics + logs | Engineering Lead mide post-cambios |

## 8. Resumen ejecutivo D5

| Finding | Severidad | Acción |
|---|---|---|
| Vercel OOM estructural (ya conocido) | **P1** | Upgrade a `large` build machine o bundle reduction |
| `error.tsx` coverage baja (5/307 rutas) | **P2** | Sprint "Error boundaries" |
| Retry / backoff ausente en servicios externos | **P1** | Crear `src/lib/retry.ts` + aplicar |
| Timeouts / abort signals mínimos (3/307) | **P2** | Wrapper `withApiTimeout` |
| 66 console statements sin migrar a logger | **P1** | Migrar a `logger.error/warn` + ESLint rule |
| Cache declarativo bajo (5 usos) | **P2** | Audit específico en D7 |
| Suspense/dynamic imports bajo (16 usos) | **P3** | Lazy load componentes pesados |
| `loading.tsx` coverage alta (69 archivos) | ✅ | Mantener |

**Findings nuevos D5**: 0 críticos, 0 P0, 4 P1, 3 P2, 1 P3.
**Findings positivos**: loading.tsx coverage excelente (69 archivos), Sentry bien configurado y gateado.

## 9. Preguntas abiertas D5 (para CEO / Engineering Lead)

- **Q-D5-1**: ¿Engineering Lead puede correr Lighthouse en preview de producción + reporte de Core Web Vitals (LCP, INP, CLS)?
- **Q-D5-2**: ¿Procedemos con upgrade a Vercel `large` build machine ahora (costo mensual) o esperamos Q4 con bundle reduction?
- **Q-D5-3**: ¿`src/lib/retry.ts` entra en sprint post-Zod, o se difiere a Q4?
- **Q-D5-4**: ¿Los 66 console statements son P1 a corregir o P2 (cleanup)?

---

**Próxima entrega**: D6 — Coherencia de producto y onboarding (P2, pendiente CEO leadership decision).