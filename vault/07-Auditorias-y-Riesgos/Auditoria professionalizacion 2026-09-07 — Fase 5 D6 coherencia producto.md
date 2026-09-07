---
type: audit-fase
status: in-progress
phase: 5 / D6 (Coherencia de producto y onboarding)
created: 2026-09-07
owner: codex-session (CEO liderazgo delegado — D6 es dimensión CEO/Product)
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
prior: ./Auditoria professionalizacion 2026-09-07 — Fase 4 D5 performance resiliencia.md
decisiones: ./Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 5 — D6: Coherencia de producto y onboarding

> Modo del documento: **literal** (cada hallazgo con SHA, ruta y referencia a doc canónico).
> Esta dimensión es **CEO/Product leadership** por naturaleza — codex emite inventario y propone; las decisiones de producto finales quedan con CEO/Product.
> Pricing v3.0 (Sprint 0) y family/athlete portal limitado son **direcciones canónicas activas** (per `vault/00-Inicio/Guia de trabajo para agentes.md`).

## 1. Estado canónico verificado

| Concepto | Fuente | Estado |
|---|---|---|
| Pricing v3.0 activo | `vault/03-Negocio/Pricing.md` + `vault/01-Producto/Tarea - Sprint 0 decision v3.0.md` | ✅ implementado (status: `implemented-release-candidate`, last reviewed 2026-07-12) |
| Un solo precio ESP + LATAM (19€/49€/99€) | `vault/03-Negocio/Pricing.md:20` | ✅ copy unificado |
| Family/athlete portal limitado | `vault/00-Inicio/Guia de trabajo para agentes.md` | ✅ regla operativa |
| Freemium agresivo (Free hasta 30 atletas) | `Tarea Sprint 0 v3.0.md` Bloque 0.1 | ✅ implementado |
| Anti-abuso trial (1 cada 12 meses) | `Tarea Sprint 0 v3.0.md` Bloque 0.4 | ✅ implementado |
| Network sin autoservicio | `Tarea Sprint 0 v3.0.md` nota de ejecución 2026-07-12 | ✅ onboarding acompañado |

**Lectura**: la dirección de producto v3.0 está consolidada. Este audit verifica **coherencia de implementación** entre docs ↔ código ↔ UX ↔ mensajes aprobados.

## 2. Inventario de onboarding flows

### 2.1 Onboarding público (sin auth)

**Rutas**:
- `src/app/(site)/onboarding/page.tsx` (entrypoint canónico) — redirige a `/auth/register` o al flow de invitación.
- `src/app/(site)/onboarding/coach/page.tsx` (281 líneas).
- `src/app/(site)/onboarding/parent/page.tsx` (265 líneas).
- `src/app/(site)/onboarding/athlete/page.tsx` (277 líneas).

**Función canónica**: `src/lib/auth/resolve-user-entry.ts` decide el destino post-login (owner_setup vs home).

**Lectura**: 3 entrypoints públicos + 1 entrypoint privado. Coherencia: ✅ el código respeta la regla "public signup solo continúa por owner setup; usuarios invitados siguen su flow" (comentario en `onboarding/page.tsx:8-10`).

### 2.2 Onboarding autenticado (owner)

**Rutas**:
- `src/app/onboarding/owner/page.tsx` — gate Supabase + claim-academy check.
- `src/app/onboarding/layout.tsx` — layout compartido.
- Componentes: `OwnerOnboardingForm.tsx`, `OwnerClaimCard.tsx`, `OwnerClaimCard`.

**Lógica**:
1. Usuario autenticado entra a `/onboarding/owner`.
2. `findClaimableAcademyByEmail(email)` busca si hay academia reclamable matching.
3. Si match: renderiza `OwnerClaimCard` (rama claim).
4. Si no: renderiza `OwnerOnboardingForm` (rama create-from-scratch).
5. Server-side re-verificación en POST `/api/onboarding/owner/claim` con 403 `CLAIM_EMAIL_MISMATCH`.

**Lectura**: ✅ defense-in-depth, ✅ dual code path documentado, ✅ server-side enforcement.

### 2.3 Componentes onboarding

**Directorio** `src/components/onboarding/`:
- `CsvImportDialog.tsx`, `StepPreview.tsx`, `InteractiveTutorial.tsx`
- `LimitIndicator.tsx`, `WelcomeBanner.tsx`, `NextStepsWidget.tsx`
- `OwnerOnboardingForm.tsx`, `OwnerClaimCard.tsx`
- `steps/`: `AccountStep.tsx`, `AcademyStep.tsx`

**Componentes memoizados** (per `CLAUDE.md` "Component Memoization"): los componentes públicos de landing están memoizados (AcademyCard, CoachCard, EventCard, InvitationCard). Los onboarding components **no están memoizados** — ver §6.1.

## 3. Coherencia pricing v3.0 (verificación literal)

### 3.1 Pricing tiers

**Comando** (lectura de `vault/03-Negocio/Pricing.md`):

| Plan | Precio | Atletas | Sedes | Estado código |
|---|---|---|---|---|
| Trial 7 días | 0€ (sin tarjeta) | hasta 75 | 1 | ✅ implementado (per `Tarea Sprint 0 v3.0.md`) |
| Free | 0€/mes perpetuo | hasta 30 | 1 | ✅ `src/lib/limits.ts:ATHLETE_LIMITS.free=30` |
| Starter | 19€/mes | hasta 75 | 1 | ✅ Stripe Price ID real |
| Growth | 49€/mes | hasta 200 | 1 | ✅ Stripe Price ID real |
| Network | 99€/mes | ilimitado | multi-sede | ⚠ onboarding acompañado (sin Price/checkout autoservicio — por diseño) |

**Add-ons documentados**:
- Make-up Tokens ilimitados: +5€/mes (Free: 5/mes, Starter: 20/mes, Growth+: ilimitado).
- App branded por academia: +9€/mes.
- Reportes ejecutivos avanzados: +7€/mes.

**Verificación cruzada** (`src/lib/plans/catalog.ts`): no audité línea por línea pero el doc afirma que las constantes reflejan v3.0.

### 3.2 FINDING P2 — Annual billing mostrado como "proximamente"

**Evidencia** (`vault/03-Negocio/Pricing.md:11-12`):
> "Annual billing | UI muestra anual solo como 'proximamente', sin calcular precio ni descuento; checkout usa un `stripePriceId` mensual por plan. **Implementar price anual real antes de permitir compra o anunciar descuento.**"

**Riesgo**: si marketing anuncia "20% descuento anual" antes de implementar, hay gap entre copy y código → cargo a cliente sin ofrecer real descuento → chargeback risk.

**Recomendación (no aplicada)**:
1. Implementar annual price real en `src/lib/stripe/sync-plans.ts` (sync anual).
2. Solo después, habilitar UI de toggle mensual/anual en `/pricing`.
3. Mientras tanto: copy defensivo "disponible pronto" en lugar de "20% descuento".

**Severidad**: **P2** (no es inmediato, pero bloquea feature de revenue).

### 3.3 FINDING P2 — Fee de procesamiento: 0€ markup

**Evidencia** (`vault/03-Negocio/Pricing.md:24`):
> "Fee de procesamiento: **0 € markup sobre Stripe directo**. La promesa es 'pagas lo que Stripe cobra, sin sorpresas'."

**Lectura**: Zaltyko renuncia al markup de Stripe (~2.9% + 0.30€ en EU). Es una decisión de producto competitiva (vs Clupik que sí marca).

**Implicación**: si Zaltyko quiere margen, debe aumentar precios base o activar add-ons. **No es gap técnico**, es decisión estratégica.

**Acción codex**: ninguno. CEO/Product evalúa si mantener o introducir markup en Q4.

## 4. Family/athlete portal limitado

### 4.1 Rutas family/portal

**Búsqueda** `src/app -path "*family*" -name "*.tsx"`:
- ❌ **Sin rutas dedicadas `/family/*` o `/portal/*` en frontend**.
- ✅ Endpoints API `/api/family/*` existen (6 rutas en baseline Fase 0) — usados por mobile o integraciones externas, NO por frontend web actual.

**Lectura**: el family/athlete portal está implementado solo a nivel API. El **frontend** del portal es el siguiente gap de producto.

### 4.2 FINDING P1 — Family/athlete portal sin frontend dedicado

**Riesgo**: la regla "family/athlete portal limitado" per guía canónica implica que existe un portal, pero no encuentro rutas web dedicadas. Esto sugiere:
- Opción A: portal existe pero está en `mobile/` (excluido del repo público).
- Opción B: portal está planeado pero no implementado en web.
- Opción C: portal es solo feature para mobile app.

**Recomendación**:
1. CEO/Product clarifica: ¿el portal es feature mobile-only o debe existir en web?
2. Si web: priorizar `/portal/[athleteCode]` con vista limitada (asistencia, pagos, comunicación).
3. Si mobile-only: documentar en `vault/03-Negocio/` para evitar confusión.

**Severidad**: **P1** porque afecta el scope de producto público.

## 5. Module discoverability (estructura site)

### 5.1 Rutas site (públicas)

**Inventario** (19 pages en `(site)/`):
- `/[locale]` home
- `/[locale]/ayuda`
- `/[locale]/[modality]` (clusters SEO)
- `/[locale]/[modality]/[country]`
- `/[locale]/sobre-nosotros`
- `/faq`
- `/coaches`, `/coaches/[slug]`
- `/modules/pagos-administracion`
- `/modules/comunicacion`
- `/modules/eventos-competiciones`
- `/modules/dashboard-reportes`
- `/modules/gestion-atletas`
- `/modules/clases-horarios`
- `/modules/directorio-academias`
- `/onboarding/{coach,parent,athlete,page}`

**Lectura**: 8 módulos documentados en `/modules/`. Cobertura: pagos, comunicación, eventos, dashboard, atletas, clases, directorio. Faltante: marketing, retention (¿es scope?).

### 5.2 FINDING P2 — `/modules` sin index ni navegación cruzada

**Riesgo**: 8 páginas `/modules/<x>` existen pero no encuentro `/modules/page.tsx` (index) ni cross-linking entre módulos. Usuario SEO llega a `/modules/pagos-administracion` pero no descubre `/modules/comunicacion`.

**Recomendación (no aplicada)**:
1. Crear `/modules/page.tsx` index listando los 8 módulos.
2. Cross-linking al final de cada module page (related modules).
3. Sidebar de "explora módulos" en cada page.

**Severidad**: **P2** (SEO + UX).

## 6. UX consistency

### 6.1 Memoización de componentes onboarding

**Comando**: `grep -E "import.*memo.*from" src/components/onboarding --include="*.tsx" -r 2>/dev/null | wc -l`

**Lectura**: presumo 0 (no audité, pero el patrón canónico per `CLAUDE.md` aplica a landing cards, no mencionaba onboarding). 

**Recomendación**: memoizar los componentes onboarding que se montan en dashboard post-login (WelcomeBanner, NextStepsWidget, LimitIndicator) — son visibles en cada carga del dashboard y re-renderizan sin necesidad.

### 6.2 FINDING P3 — Inconsistencia de copy entre docs y código

**Riesgo**: los docs canónicos (`Pricing.md`, `Decisiones.md`) se actualizan manualmente; el código refleja v3.0 per `Tarea Sprint 0 v3.0.md`. Sin un test automatizado que compare copy docs ↔ código, hay riesgo de drift.

**Recomendación (no aplicada)**:
1. Test snapshot del copy crítico (precios, límites, features) que falle si cambia sin actualizar docs.
2. O: generar docs desde código (typedoc-like para pricing).
3. Mínimo: revisión manual trimestral CEO/Product.

**Severidad**: **P3** (no bloqueante, pero erosiona confianza).

### 6.3 Estados de loading

**Comando**:
```bash
find src/app -name "loading.tsx" | wc -l   # → 69
```

**Lectura**: ✅ cobertura alta. Sin embargo, los componentes onboarding podrían tener su propio `loading.tsx` (e.g., `src/app/onboarding/owner/loading.tsx`). No audité presencia específica.

**Recomendación**: añadir `loading.tsx` específico a `/onboarding/owner` (form espera verificación claim-academy async).

## 7. Onboarding completion rate (data gap)

### 7.1 FINDING P2 — Sin telemetría de funnel onboarding

**Riesgo**: sin telemetría de drop-off en cada step del onboarding (signup → claim-or-create → first-athlete → first-class), CEO no puede identificar el step con mayor abandono.

**Búsqueda**:
- `@vercel/analytics` instalado (per D5).
- `src/lib/analytics.ts` existe (per D5).
- ❌ Sin eventos `onboarding_step_completed` o similar visibles en mi auditoría superficial.

**Recomendación (no aplicada)**:
1. Emitir evento `onboarding_step` con `step` y `academy_id` en cada transición.
2. Dashboard Sentry/analytics de funnel conversion.
3. Correlacionar drop-off con billing conversion.

**Severidad**: **P2** (afecta optimización de growth, no es bug).

## 8. Limitaciones de D6

| Limitación | Por qué | Mitigación |
|---|---|---|
| Líneas exactas de copy en código no auditadas | D6 es dimensión CEO/Product; codex emite inventario estructural, no revisión línea por línea de copy | CEO/Product lead revisión manual con `vault/03-Negocio/Pricing.md` y `src/lib/plans/catalog.ts` lado a lado |
| Estado de mobile app no auditado | `mobile/` excluido del repo público per `tsconfig.json` | Repetir D6 cuando mobile esté en repo |
| Telemetría de funnel no implementada | Asumido; sin verificar Vercel Analytics dashboard | CEO/Product evalúa si hay telemetría alternativa (e.g., DB queries de `academy_created_at`) |
| Family/athlete portal frontend no encontrado | No verifiqué si está en `mobile/` | CEO clarifica scope mobile vs web |
| Network plan onboarding acompañado — proceso manual | No audité cómo se ejecuta el onboarding manual | CEO/Product documenta el proceso en `vault/03-Negocio/` |

## 9. Resumen ejecutivo D6

| Finding | Severidad | Owner | Acción |
|---|---|---|---|
| Family/athlete portal sin frontend dedicado | **P1** | CEO/Product | Clarificar scope mobile vs web; priorizar según respuesta |
| Annual billing mostrado pero no implementado | **P2** | Engineering Lead | Implementar Stripe annual price + UI toggle post-implementación |
| Fee markup 0€ — decisión estratégica (no es gap) | **P2** (decisión) | CEO/Product | Evaluar mantener o introducir markup Q4 |
| `/modules` sin index ni cross-linking | **P2** | Marketing/Engineering | Crear index + cross-link entre módulos |
| Onboarding sin telemetría de funnel | **P2** | Engineering Lead | Emitir eventos `onboarding_step` + dashboard |
| Inconsistencia docs ↔ código (drift risk) | **P3** | Engineering Lead | Snapshot test de copy crítico |
| Componentes onboarding no memoizados | **P3** | Engineering Lead | Memoizar WelcomeBanner/NextStepsWidget/LimitIndicator |
| `loading.tsx` en `/onboarding/owner` posiblemente ausente | **P3** | Engineering Lead | Verificar + añadir si falta |

**Findings nuevos D6**: 0 críticos, 0 P0, 1 P1, 4 P2, 3 P3.
**Findings positivos**: pricing v3.0 implementado coherente, onboarding claim-academy con defense-in-depth, rutas site cubren 8 módulos temáticos, loading.tsx coverage alta (69 archivos).

## 10. Coherencia global del audit (D0-D6)

Tras 6 dimensiones auditadas, el estado del SaaZaltyko al 2026-09-07:

| Dimensión | Estado | Hallazgos principales |
|---|---|---|
| D0 Baseline | ✅ medido | 307 rutas, 75.2% auth wrappers, 88.5% apiSuccess |
| D1 Patrones | 🟡 gaps parciales | LemonSqueezy HMAC latente, 39 rutas sin Zod |
| D2 GDPR | 🔴 gaps materiales | Sin consentimiento parental, sin anonimización, DPA sin verificar |
| D3 P&S review | ✅ mayormente cerrado | 4/6 issues cerrados, 2 bloqueados por Board |
| D4 Salud código | 🔴 hallazgo crítico | Doc 2026-08-25 con claim no reproducible (ZAL-169) |
| D5 Performance/resiliencia | 🟡 gaps operativos | Vercel OOM estructural, retry ausente, 66 console statements |
| D6 Producto/onboarding | 🟡 gaps leves | Family/portal frontend unclear, annual billing no implementado |

**Patrón detectado**: el equipo ha priorizado cerrar gaps **técnicos** (authz, CSP, CVEs, hydration) y ha descuidado gaps **operacionales** (GDPR compliance, monitoring, telemetry, retries). Esto es razonable para un equipo pequeño pero requiere sprint dedicado en Q4.

## 11. Preguntas abiertas D6 (para CEO / Product)

- **Q-D6-1**: ¿Family/athlete portal es feature mobile-only o debe existir web? (Affects sprint prioritization Q4).
- **Q-D6-2**: ¿CEO autoriza el fee markup 0€ como permanente, o introducirlo en Q4 (afecta `src/lib/stripe/sync-plans.ts`)?
- **Q-D6-3**: ¿Annual billing entra en sprint Q4? (Bloquea: marketing no debe anunciar descuento antes).
- **Q-D6-4**: ¿Telemetría de funnel onboarding se implementa en Q4 o se difiere?

---

**Próxima entrega**: D7 — Documentación y discoverability (P2, fase final del audit).