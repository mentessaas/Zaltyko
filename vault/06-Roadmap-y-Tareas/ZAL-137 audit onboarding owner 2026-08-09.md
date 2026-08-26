# ZAL-137 — auditoría onboarding owner existente (2026-08-09)

## Objetivo

Auditoría read-first + ejecución del flujo owner para el alcance aprobado en
[ZAL-130](/ZAL/issues/ZAL-130) ([STATE-LAYER-9] Spec de onboarding Zaltyko Web).

Alcance de ZAL-137:

- claim academy (email matches `academies.contactEmail` → toma ownership)
- invite (primer entrenador) — vía wizard / checklist
- first class skipeable (avanzada del form permite desmarcar starter groups)
- first class retomable (vía dashboard si no se crearon starter classes)
- navegación al siguiente paso (redirect post-submit → dashboard con checklist)

Restricciones: no inventar multi-academy, billing ni athlete self-serve.

## Hallazgos read-first (estado del código al 2026-08-09)

### Rutas verificadas

- `src/app/onboarding/owner/page.tsx` — server component, gate Supabase + `resolveUserHome`. Renderiza SOLO `<OwnerOnboardingForm />`.
- `src/app/onboarding/layout.tsx` — wrapper mínimo, `force-dynamic`.
- `src/app/(site)/onboarding/page.tsx` — entrypoint público. Redirige a `/onboarding/owner` si destination es `owner_setup`.
- `src/components/onboarding/OwnerOnboardingForm.tsx` — formulario create-from-scratch (country/rama/tipo/grupos). Hardcoded `countryCode = "es"`, soporta toggle starter groups en panel avanzado.
- `src/app/api/onboarding/owner/route.ts` — POST: crea profile + academy + grupos + clases starter; marca `create_first_group` y `setup_weekly_schedule`. Retorna `{academyId, redirectUrl: '/app/{id}/dashboard'}`.
- `src/lib/auth/resolve-user-home.ts` — devuelve `owner_setup` cuando no hay profile + no hay invitación pendiente. Para usuarios con profile+membership, deriva a `academy_workspace` o `global_dashboard`.
- `src/lib/onboarding.ts` — `markChecklistItem`, `markWizardStep`, `getOnboardingStatus`. WIZARD_STEPS = academy / athletes / payments-team / brand / activation. CHECKLIST_KEYS = `add_5_athletes`, `create_first_group`, `setup_weekly_schedule`, `invite_first_coach`, `enable_payments`, `send_first_communication`, `login_again`.
- `src/lib/onboarding/next-step-urls.ts` — allowlist `next_step_key → path`. Cubre todos los wizard + checklist keys + aliases (billing_setup, first_communication). Implementación: ZAL-324 Gap 2.

### Gaps vs ZAL-130 spec

| Capacidad                                          | Estado actual                                      | Gap                                                                                                          |
|----------------------------------------------------|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| claim academy                                      | NO existe en código (`OwnerClaimCard`, helper, endpoint). El flow actual es solo create-from-scratch. | Falta flujo de claim cuando `user.email` matchea `academies.contactEmail` (case-insensitive, índice dedicado `academies_contact_email_idx`). |
| invite (primer entrenador)                         | Existe checklist item `invite_first_coach` y wizard step `payments-team`; no existe UI de invite en el onboarding flow. | Sin acción visible post-claim; el dashboard tiene la checklist widget. Aceptable: post-submit → dashboard. |
| first class skipeable                              | Funciona implícitamente: el toggle en panel avanzado desmarca starter groups; la API hace `if (selectedStarterGroups.length === 0) continue` y no crea starter classes. | Descubrible pero implícito. No requiere cambio. |
| first class retomable                              | Si owner desmarca todos los starter groups, no se crean starter classes; dashboard permite crear classes después. | El form es one-shot; dashboard cubre la retomabilidad. No requiere cambio. |
| navegación al siguiente paso                       | API redirect = `/app/{id}/dashboard` (hardcoded). Dashboard tiene checklist widget + next-step widget. | Acceptable: el dashboard muestra el siguiente paso (wizard + checklist). Alternativa: usar `NEXT_STEP_URLS`. |

### Verificación adicional

- `git log -S 'OwnerClaimCard'` → solo aparece en commits docs (ZAL-396, ZAL-336, ZAL-157, ZAL-138). NO hay commit de feature que añada el componente.
- `git log -S 'findClaimableAcademyByEmail'` → mismo resultado (solo docs).
- `git log -S 'owner/claim'` → mismo resultado (solo docs).
- **El trabajo reclamado por el agente el 2026-08-01 ("OwnerClaimCard, /api/onboarding/owner/claim, pg_advisory_xact_lock") NO está en el árbol actual.** El board aprobó el 2026-08-02 basándose en esa afirmación. La aprobación quedó pendiente de cierre por SHA gate.

### Contratos que sí existen (reusables)

- `academies.contactEmail text` + `academies_contact_email_idx` → query directa con `lower()` o `ilike`.
- `academies.ownerId` FK → `profiles.id` (cascade on delete).
- `academies.tenantId` → reusar en el claim, NO generar nuevo.
- `withTenant` wrapper (`src/lib/authz.ts`) → `withTenant` para endpoints tenant-scoped; el POST de claim es per-user (auth.getUser), no tenant-scoped al inicio (porque el claim CREA el tenant context).
- `apiSuccess`/`apiCreated`/`apiError` → respuestas estandarizadas.
- `getOptionalEnvVar("DISABLE_ONBOARDING_AUTOMATIONS")` → skip automation en test.

## Plan de implementación mínimo (read-first → change)

Siguiendo el principio de cambios mínimos:

1. **Helper `findClaimableAcademyByEmail`** — query case-insensitive sobre `academies.contactEmail`, devuelve `{id, name, tenantId}` o null. Pure logic, testeable.
2. **Componente `OwnerClaimCard`** — server-friendly card con botón "Confirmar y entrar". POST → `/api/onboarding/owner/claim`. Tenant isolation: el handler reusa `tenantId` del academy.
3. **Endpoint POST `/api/onboarding/owner/claim`** — `pg_advisory_xact_lock(user.id)` + upsert profile (role=owner, tenantId=academy.tenantId, activeAcademyId=academy.id) + `onConflictDoNothing` memberships (resistente doble-click).
4. **Modificar `src/app/onboarding/owner/page.tsx`** — chequeo claim primero: si `findClaimableAcademyByEmail` retorna algo → render `OwnerClaimCard`; si no → `OwnerOnboardingForm`.
5. **Test del helper** — pure logic, sin DB.
6. **Verificación local** — `pnpm typecheck` (al menos del subset tocado).

## Lo que NO se hace (scope guard)

- No se inventa multi-academy (un owner = una academia).
- No se añade billing/cobros al onboarding.
- No se abre athlete self-serve.
- No se modifica `resolveUserHome` ni RLS.
- No se cambian los redirects existentes para usuarios que ya tienen academia.