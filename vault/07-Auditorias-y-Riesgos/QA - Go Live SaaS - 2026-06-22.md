---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../tests/e2e-zaltyko-p1-flows.spec.ts
  - ../tests/e2e-zaltyko-full.spec.ts
  - ../tests/product-go-live-readiness.test.ts
  - ../src/lib/product/features.ts
  - ../src/lib/plans/catalog.ts
---
# QA - Go Live SaaS - 2026-06-22

## Alcance v1 vendible

- Una academia por cliente en Starter y Growth.
- Network puede cubrir varias sedes solo con diagnostico y onboarding acompanado.
- Mantener arquitectura multi-tenant tecnica para aislamiento entre clientes, roles e invitaciones.
- Primer release vendible: atletas, clases, grupos, asistencia basica, eventos, anuncios, billing base, perfiles, invitaciones y configuracion.

## Guardrails automatizados

- `tests/product-go-live-readiness.test.ts` valida que las features inmaduras sigan apagadas por defecto.
- `tests/limits.test.ts` valida que Starter y Growth tengan `academyLimit: 1` y que Growth no prometa academias ilimitadas.
- `tests/e2e-zaltyko-p1-flows.spec.ts` cubre smoke autenticado de asistencia, reportes, evaluaciones y onboarding APIs cuando existen `E2E_ACADEMY_ID` y `E2E_STORAGE_STATE`.
- `pnpm audit:api-routes:strict` revisa clasificacion de auth/tenant/rate limit en rutas API.
- `pnpm validate:rls` queda en PASS con 62 tablas tenant y 100% de cobertura despues de agregar RLS a `academy_sport_configs`, `athlete_sport_configs` y `coach_sport_configs`.

## Evidencia local 2026-06-22

- PASS `pnpm typecheck`
- PASS `pnpm lint`
- PASS `pnpm audit:api-routes:strict`
- PASS `pnpm validate:rls`
- PASS `pnpm verify:production`
- PASS `pnpm exec vitest run tests/product-go-live-readiness.test.ts`
- PASS `pnpm build`

## Evidencia sandbox real 2026-06-22

- Sandbox Supabase conectado con academia `9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb`.
- Sesion auth generada en `.auth/user.json` con owner E2E.
- PASS `pnpm test:e2e:verify-supabase`.
- PASS `pnpm test:e2e:auth`.
- PASS `pnpm exec playwright test tests/e2e-zaltyko-p1-flows.spec.ts`: 5/5 en 9.7 min.
- Evidencia generada en `test-results/` y `playwright-report/`.
- Migraciones aplicadas al sandbox durante QA:
  - `0009_add_technical_guidance_fields.sql`
  - `20260622140000_sync_athlete_assessments_schema.sql`
  - `20260622153000_add_sport_config_rls.sql`
  - `20260622154500_add_class_commercial_fields.sql`
  - `20260622160000_sync_billing_invoices_schema.sql`

## Checklist con sandbox real

### Onboarding/trial

- [x] Registrar owner nuevo o usar owner sandbox persistente.
- [x] Crear/usar academia sandbox.
- [x] Configurar disciplina, programas y aparatos.
- [x] Confirmar grupos y clases starter creados o clase minima creada por QA.
- [x] Crear primer atleta.
- [x] Crear o confirmar primera clase.
- [x] Registrar primer cobro/demo: billing base controlado; checkout Growth devuelve 503 cuando Stripe usa `price_pro_PLACEHOLDER`.
- [x] Confirmar redirect/navegacion final a `/app/[academyId]/dashboard`.

### Evaluaciones

- [x] Crear atleta.
- [x] Abrir evaluacion.
- [x] Guardar evaluacion.
- [x] Ver historial/progreso.
- [x] Consultar resumen/historial por API.
- [x] Tenant scope validado por `withTenant`, RLS 100% y uso de `E2E_ACADEMY_ID` en la suite.

### Asistencia y reportes

- [x] Crear clase/sesion.
- [x] Inscribir atleta.
- [x] Registrar asistencia.
- [x] Ver reporte de asistencia.
- [x] Exportar PDF.
- [x] Confirmar filtros por tenant/academia.

### Comunicacion consolidada

- [x] Cargar mensajes.
- [x] Cargar notificaciones.
- [x] Confirmar historial/superficies visibles sin error de pagina.
- [x] Confirmar estado leido/no leido basico por APIs de notificaciones.
- [x] Confirmar que WhatsApp queda degradado sin romper cuando `NEXT_PUBLIC_FEATURE_WHATSAPP` esta apagado.

### Billing operativo

- [x] Confirmar plan free/status por defecto.
- [x] Checkout Growth mensual controlado: devuelve 503 `STRIPE_NOT_CONFIGURED` si el price es placeholder.
- [ ] Webhook Stripe `checkout.session.completed` con price real.
- [ ] Suscripcion activa en Zaltyko con price real.
- [ ] Portal Stripe abre para owner con customer/subscription real.
- [ ] Upgrade/downgrade/cancel con price real.
- [x] Estado `past_due` queda documentado como pendiente de simulacion Stripe.
- [x] Anual no comprable si falta `stripePriceId` anual.

## Evidencia requerida antes de abrir masivo

- `pnpm typecheck`
- `pnpm lint`
- `pnpm audit:api-routes:strict`
- `pnpm verify:production`
- `pnpm validate:rls`
- Playwright con `BASE_URL`, `E2E_ACADEMY_ID` y `E2E_STORAGE_STATE`
- Capturas o reporte bajo `test-results/` y `playwright-report/`

## Riesgo residual

El alcance v1 comercial queda validado para piloto/controlado con Supabase sandbox real. El unico bloqueo para cobro autoservicio masivo es configurar prices reales de Stripe test/prod y ejecutar webhook, portal, upgrade/downgrade/cancel y `past_due` con suscripcion real. Mientras existan placeholders como `price_pro_PLACEHOLDER`, checkout degrada honestamente a `STRIPE_NOT_CONFIGURED` y no debe venderse como cobro self-serve completo.
