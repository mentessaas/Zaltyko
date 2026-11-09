# Limpieza de E2E obsoletos y estado de los E2E autenticados (P1 #10)

Fecha: 9 de noviembre de 2026. Base: `origin/main` en `32d6575e`. Trabajo de código y documentación: no se ha tocado el sandbox, Stripe, producción ni ningún secreto.

## Hallazgos

### 1. Jobs E2E autenticados apagados a propósito

`.github/workflows/ci.yml` tiene `e2e-readiness` (línea 252, `if: ${{ false }}` en la 256) y `e2e-auth` (línea 494, `if: ${{ false }}` en la 498). El comentario de los dos dice «Remote Sandbox E2E stays disabled pending separate explicit authorization», y el contrato `tests/e2e-sandbox-environment-gate-contract.test.ts` lo exige. Se apagaron en `f84fd6dc` (#226).

Reactivar `e2e-auth` tal cual **escribiría en el ensayo**:

- Aplica DDL al sandbox (`pnpm e2e:prepare-domain`, `apply-e2e-contact-schema.ts`).
- Restablece contraseñas y vínculos (`pnpm e2e:prepare-auth`) y crea un usuario de familia (`prepare-e2e-family-auth.ts`).
- Crea clientes, tarjetas y suscripciones en Stripe TEST (`e2e-billing-annual-checkout.spec.ts`).

Esta PR **no cambia** esos `if`.

### 2. Skips: qué se ha borrado y qué se conserva

El triaje en solo lectura contó 73 llamadas `skip` (58 de Playwright y 15 de Vitest). Antes de borrar se comprobó cada suite contra el código actual.

**Borradas (prueban superficies retiradas):**

| Archivo | Skips | Motivo |
|---|---|---|
| `tests/e2e/marketplace-flow.spec.ts` | 2 | Marketplace cerrado por el corte de lanzamiento (`isOutsideEssentialLaunch`). Además tenía un `await` en un `describe` no async. |
| `tests/e2e/marketplace-public.spec.ts` | 0 | Visita `/marketplace`, que hoy responde 404. Habría fallado al activarse. |
| `tests/e2e-zaltyko-stripe-connect-flow.spec.ts` | 12 | Cobro a familias con Stripe Connect, fuera del lanzamiento. Sus rutas (`/api/charges/[chargeId]/collect`, `/api/family/payment-method/setup-intent`) ya responden `FAMILY_AUTOMATIC_COLLECTION_DISABLED`. |
| `tests/e2e-zaltyko-sca-3ds-flow.spec.ts` | 6 | Reto 3DS sobre el mismo cobro con Connect. Su runbook (`docs/RUNBOOK_E2E_SCA_3DS.md`) queda marcado como retirado. |

Total: 20 skips menos y dos suites que habrían fallado en cuanto se activaran. Si Connect vuelve a entrar en alcance, las suites se recuperan del historial de Git.

**Conservadas (el triaje las marcó como obsoletas, pero prueban rutas vivas):**

Las rutas `/app/[academyId]/*` (dashboard, athletes, classes, billing, settings, assessments, messages, events, `dashboard/at-a-glance`, `coach/today-simple`) y `/dashboard/users` y `/dashboard/profile` **siguen existiendo**. Las usan las academias del modelo antiguo hasta su migración (plan P2 #18). Por eso se conservan:

- `tests/e2e-zaltyko-full.spec.ts`
- `tests/a11y-zaltyko.spec.ts`, bloque autenticado
- `tests/e2e-zal-604-a11y-focal.spec.ts`
- `tests/e2e-zal-621-a11y-journeys.spec.ts`
- `tests/e2e-zal-624-at-a-glance.spec.ts`
- `tests/e2e-zaltyko-audit-smoke.spec.ts`
- `tests/e2e-zaltyko-p1-flows.spec.ts`
- `tests/e2e-link-requests-ui.spec.ts`

Sus skips dependen de credenciales: se reactivarán con el job de solo lectura (ver «Siguiente paso») o se borrarán módulo a módulo al retirar `/app`.

### 3. Correcciones menores

- `tests/e2e-role-smoke.spec.ts`: se quita `/dashboard/marketplace/mis-productos` de `ownerLegacyReadOnlyPaths`. El middleware responde 404 y el test exige <400, así que habría fallado.
- Los skips por `E2E_ROUTE_AUDIT_*` (:186, :299) se mantienen. Necesitan fixtures sembradas en el sandbox, que es una escritura, así que dependen de la misma autorización.
- `.github/workflows/ci.yml`: se quita `E2E_PROFILE_ID`, que ningún test lee.
- El job `e2e-auth-required-gate` **no se renombra**. Su nombre visible («Local Synthetic Owner E2E Required Gate») es un check obligatorio de la protección de main, y su id lo fija el contrato `e2e-sandbox-environment-gate-contract.test.ts`. Aunque el id dice «auth», el job solo protege el E2E local sintético `e2e-local-owner`.
- Comentarios en `tests/e2e-zaltyko-auth-save.spec.ts`, `scripts/prepare-e2e-family-auth.ts` y `scripts/seed-e2e-charge.ts`: dejan de apuntar a la suite borrada.

## Fuente

- Triaje en solo lectura de `origin/main` (bdd1d335) por un agente de la sesión coordinadora, contrastado archivo a archivo antes de borrar.
- `src/lib/launch/essential-routes.ts`, `src/app/app/[academyId]/**` y `src/app/api/charges/[chargeId]/collect/route.ts`.

## Importancia

Media. Los skips muertos ocultan qué cobertura existe de verdad, y dos suites habrían fallado en cuanto alguien las activara. La cobertura real de `/owner` en cada PR sigue siendo el E2E local sintético en tres navegadores, que es obligatorio.

## Siguiente paso (pendiente de autorización de Elvis)

1. **Job nuevo `e2e-sandbox-readonly`**, sin implementar:
   - Disparo solo con `workflow_dispatch` y entrada `expected_sha`, antes de cada publicación.
   - `environment: e2e-sandbox` con revisor obligatorio.
   - Solo `tests/e2e-owner-dashboard.spec.ts` en Chromium.
   - Sin pasos de aprovisionamiento, sin `E2E_ALLOW_PROVISIONING` y sin clave secreta de Stripe.
   - Idealmente con una `DATABASE_URL` de rol `default_transaction_read_only`.
2. **Autorizaciones previas:**
   - Iniciar sesión escribe en Auth (sesiones, `last_sign_in_at`) incluso en suites de solo lectura.
   - Hacen falta una cuenta y una organización QA distintas de las fixtures del ensayo natural.
   - Hay que comprobar, en solo lectura, que existen los IDs `E2E_DOMAIN_ORGANIZATION_ID` y `E2E_DOMAIN_LOCATION_ID`.
3. Las suites que escriben (checkout anual, contacto, aprovisionamiento) se quedan fuera del ensayo: se ejecutan en el harness local sintético o en un sandbox desechable distinto.
4. Al retirar cada módulo de `/app` (P2 #18), se borran sus suites conservadas aquí.
