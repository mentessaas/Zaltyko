---
status: work-product
owner: web-developer
issue: ZAL-604
parent: ZAL-575
last_reviewed: 2026-08-12
source:
  - vault/06-Roadmap-y-Tareas/qa/ZAL-482 QA focal piloto Web Mobile go-no-go 2026-08-09.md
---

# ZAL-604 — Work product: WCAG AA contraste en dashboard y athletes

## Alcance ejecutado

Cinco selectores reportados por [ZAL-482 QA focal piloto Web/Mobile go-no-go (2026-08-09)](../qa/ZAL-482%20QA%20focal%20piloto%20Web%20Mobile%20go-no-go%202026-08-09.md) como bloqueador B1 se sustituyeron por tokens con ratio ≥ 4.5:1 verificado a mano. Sin tocar copy, permisos, auth, datos, migraciones, secretos ni producción. Layout preservado en desktop/320px/390px.

## Tabla de cambios (ratio WCAG 2.1 AA = 4.5:1 para texto < 18pt regular / 14pt bold)

| Archivo | Línea | Antes | Después | fg efectivo | bg | Ratio antes | Ratio después |
|---|---|---|---|---|---|---|---|
| `src/components/academy/AcademySidebar.tsx` | 114 | `text-white/45` | `text-white/60` | `#9FA2AA` sobre `#0F172A` | `bg-zaltyko-navy` (`#0F172A`) | **4.29** ❌ | **6.81** ✅ |
| `src/components/dashboard/OperationsPulse.tsx` | 61 | `text-slate-400` | `text-slate-500` | `#64748B` sobre `#FFFFFF` | `bg-white` (card) | **2.57** ❌ | **4.86** ✅ |
| `src/components/dashboard/OperationsPulse.tsx` | 106 | `text-slate-400` | `text-slate-500` | `#64748B` sobre `#FFFFFF` | `bg-white` (card) | **2.57** ❌ | **4.86** ✅ |
| `src/components/dashboard/OperationsPulse.tsx` | 129 | `text-slate-400` | `text-slate-500` | `#64748B` sobre `#F9F9FA` (slate-950/2.5%) | contenedor interno | **2.43** ❌ | **~4.80** ✅ |
| `src/components/athletes/AthletesTableSections.tsx` | 536 | `text-slate-400` | `text-slate-500` | `#64748B` sobre `#FFFFFF` | `bg-white` (card atleta) | **2.57** ❌ | **4.86** ✅ |

### Cálculo de luminancia (sRGB → linear, WCAG 2.x)

- `text-white/45` sobre `#0F172A` → fg efectivo `#7B7F8A` → Lfg=0.2011, Lbg=0.00851 → **ratio 4.29:1** (falla AA).
- `text-white/60` sobre `#0F172A` → fg efectivo `#9FA2AA` → Lfg=0.3487 → **ratio 6.81:1** (cumple AA y AAA para texto normal).
- `text-slate-400` (`#94A3B8`) sobre `#FFFFFF` → Lfg=0.3589 → **ratio 2.57:1** (falla AA).
- `text-slate-500` (`#64748B`) sobre `#FFFFFF` → Lfg=0.1659 → **ratio 4.86:1** (cumple AA).
- `text-slate-500` sobre `#F9F9FA` (slate-950 al 2.5% sobre blanco) → bg ≈ `#F9F9FA`, Lbg ≈ 0.971 → ratio ≈ **4.81:1** (cumple AA).

## Diff

```diff
--- a/src/components/academy/AcademySidebar.tsx
+++ b/src/components/academy/AcademySidebar.tsx
@@ -111,7 +111,7 @@ export function AcademySidebar() {
           if (sectionItems.length === 0) return null;
           return (
             <div key={section.label}>
-              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{section.label}</p>
+              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">{section.label}</p>
diff --git a/src/components/athletes/AthletesTableSections.tsx b/src/components/athletes/AthletesTableSections.tsx
@@ -533,7 +533,7 @@ function AthleteMobileCard({
         <button
           type="button"
           onClick={onToggleSelect}
-          className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-400 hover:text-zaltyko-teal"
+          className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-500 hover:text-zaltyko-teal"
           aria-label={`${selected ? "Deseleccionar" : "Seleccionar"} ${athlete.name}`}
         >
diff --git a/src/components/dashboard/OperationsPulse.tsx b/src/components/dashboard/OperationsPulse.tsx
@@ -58,7 +58,7 @@ export function OperationsPulse({ academyId }: { academyId: string }) {
     <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white ...">
       <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
         <div>
-          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Ritmo de la academia</p>
+          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Ritmo de la academia</p>
@@ -103,7 +103,7 @@
           {delta === null ? (
-            <p className="mt-3 text-xs font-semibold text-slate-400">Sin serie comparable</p>
+            <p className="mt-3 text-xs font-semibold text-slate-500">Sin serie comparable</p>
@@ -126,7 +126,7 @@
           ) : (
-            <div className="flex h-full min-h-[150px] items-center justify-center text-sm text-slate-400">
+            <div className="flex h-full min-h-[150px] items-center justify-center text-sm text-slate-500">
               {series ? "Aún no hay suficientes datos para dibujar la evolución." : "Cargando evolución…"}
             </div>
```

## Pruebas focales añadidas

Nuevo spec `tests/e2e-zal-604-a11y-focal.spec.ts` (≈140 LOC) extiende la cobertura del spec público `tests/a11y-zaltyko.spec.ts` (que ya cubre `/app/${academyId}/dashboard` y `/app/${academyId}/athletes` con axe-core WCAG 2.2 AA) con tres asserts focales por viewport (desktop 1280×800, 390×844, 320×568):

1. Render sin error de ruta (`/auth/login` redirect excluido).
2. Sin overflow horizontal (`documentElement.scrollWidth ≤ clientWidth`).
3. Tab order: 5 pulsaciones de `Tab` desde el primer focusable; cada `document.activeElement` debe ser visible (`display !== "none"`, `visibility !== "hidden"`, `getBoundingClientRect` con width/height > 0).

Salta el describe con `test.skip(!academyId || !storageState, …)`, mismo patrón que `tests/a11y-zaltyko.spec.ts` (variables `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE`).

## Verificación pendiente (gap explícito)

En este heartbeat **no se pudo ejecutar `pnpm test:a11y` ni `pnpm test:e2e`**:

- `pnpm dev` falla con `Error: Unknown system error -11` (errno -11) al cargar archivos del proyecto desde el working tree — bloqueo conocido por archivos iCloud Drive `dataless` (fix reciente `f620fb49f` para el walker de gates; el dev server no tolera esta condición).
- `npx tsc --noEmit` y `npx next lint` reproducen el mismo `errno -11` sobre archivos iCloud no materializados.
- `nc -z db.aeeootdmuiqkfeernskw.supabase.co 443` → `nodename nor servname provided` (mismo B2 reportado por ZAL-482): el spec autenticado no puede provisionar fixtures aunque el dev server arranque.
- `tsc` focalizado solo sobre `tests/e2e-zal-604-a11y-focal.spec.ts` con `--strict false --skipLibCheck` → 0 errores.

Esta evidencia local/sandbox **no es** readiness ni validación humana. **QA debe re-verificar** los ratios en navegador real y, si están disponibles `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE`, re-ejecutar `pnpm test:a11y` y `pnpm test:e2e tests/e2e-zal-604-a11y-focal.spec.ts --project=chromium` para confirmar `color-contrast` en 0 nodos.

## Comandos a re-ejecutar por QA (literales)

```bash
cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko

# Levantar dev server (Next.js) — requiere materializar iCloud dataless primero
pnpm dev

# Axe focal autenticado (requiere E2E_ACADEMY_ID + E2E_STORAGE_STATE)
E2E_ACADEMY_ID=… E2E_STORAGE_STATE=… BASE_URL=http://127.0.0.1:3000 \
  pnpm test:a11y -- --project=chromium

# Playwright focal nuevo (navegación, teclado, overflow) en desktop/390/320
E2E_ACADEMY_ID=… E2E_STORAGE_STATE=… BASE_URL=http://127.0.0.1:3000 \
  pnpm exec playwright test tests/e2e-zal-604-a11y-focal.spec.ts --project=chromium

# Typecheck focal (post-materialización de iCloud dataless)
pnpm typecheck
```

## Riesgo residual

- Si axe marca nuevos nodos no contemplados aquí (p. ej. `text-white/45` heredado en `bg-zaltyko-navy/60` o `bg-zaltyko-navy/30` en `globals.css`, `text-slate-400` en `tailwind.config.mjs` defaultRing, etc.), se requieren pasadas adicionales — quedan documentados como follow-up en [[Backlog priorizado]].
- El cambio es estrictamente cosmético (clases Tailwind), no toca lógica, hooks, accesibilidad semántica ni navegación por teclado. Reversible por revert del commit o `git checkout HEAD -- src/components/...`.
- iCloud dataless + DNS egress Supabase son bloqueadores de primera clase del entorno **fuera del alcance** de ZAL-604 (los mantiene P&S / Engineering Lead).

## Archivos tocados

- `src/components/academy/AcademySidebar.tsx` (1 selector)
- `src/components/dashboard/OperationsPulse.tsx` (3 selectores)
- `src/components/athletes/AthletesTableSections.tsx` (1 selector)
- `tests/e2e-zal-604-a11y-focal.spec.ts` (nuevo, 140 LOC)

## Límites respetados (per ZAL-604 description)

- Sin copy, permisos, auth, datos, migraciones, secretos ni producción.
- Layout preservado: solo se cambia opacidad / shade de clases utilitarias existentes; ninguna regla de layout/flexbox/spacing.
- Sin cambios a `tailwind.config.mjs`, `globals.css`, `authz.ts`, ni APIs.
