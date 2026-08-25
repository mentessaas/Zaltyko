# ZAL-137 — auditoría onboarding owner existente (actualización read-first 2026-08-24)

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

- `src/app/onboarding/owner/page.tsx` — server component, gate Supabase + `resolveUserHome`. Renderiza `<OwnerClaimCard />` cuando el email coincide con `academies.contactEmail`; si no, `<OwnerOnboardingForm />`.
- `src/app/onboarding/layout.tsx` — wrapper mínimo, `force-dynamic`.
- `src/app/(site)/onboarding/page.tsx` — entrypoint público. Redirige a `/onboarding/owner` si destination es `owner_setup`.
- `src/components/onboarding/OwnerOnboardingForm.tsx` — formulario create-from-scratch (country/rama/tipo/grupos). Hardcoded `countryCode = "es"`, soporta toggle starter groups en panel avanzado.
- `src/components/onboarding/OwnerClaimCard.tsx` + `src/lib/auth/claim-academy.ts` — rama claim por email normalizado (trim + lowercase).
- `src/app/api/onboarding/owner/claim/route.ts` — POST autenticado por Supabase; revalida email, hereda `tenantId`, bloquea la carrera por usuario y crea membership owner idempotente.
- `src/app/api/onboarding/owner/route.ts` — POST: crea profile + academy + grupos + clases starter; marca `create_first_group` y `setup_weekly_schedule`. Retorna `{academyId, redirectUrl: '/app/{id}/dashboard'}`.
- `src/lib/auth/resolve-user-home.ts` — devuelve `owner_setup` cuando no hay profile + no hay invitación pendiente. Para usuarios con profile+membership, deriva a `academy_workspace` o `global_dashboard`.
- `src/lib/onboarding.ts` — `markChecklistItem`, `markWizardStep`, `getOnboardingStatus`. WIZARD_STEPS = academy / athletes / payments-team / brand / activation. CHECKLIST_KEYS = `add_5_athletes`, `create_first_group`, `setup_weekly_schedule`, `invite_first_coach`, `enable_payments`, `send_first_communication`, `login_again`.
- `src/lib/onboarding/next-step-urls.ts` — allowlist `next_step_key → path` para emails; no es el redirect del alta owner.
- `src/components/dashboard/OnboardingChecklist.tsx` + `src/components/dashboard/DashboardPage.tsx` — el dashboard consume el checklist y expone el CTA del paso pendiente; `/app/{academyId}/groups`, `/classes` y `/coaches` existen.

### Gaps vs ZAL-130 spec

| Capacidad                                          | Estado actual                                      | Gap                                                                                                          |
|----------------------------------------------------|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| claim academy                                      | Implementado en `045dde0c`: la página detecta el email y el endpoint revalida el match, hereda el tenant existente y evita duplicados. | Falta cobertura focal del endpoint/UI; no se amplía a selección de varias academias. |
| invite (primer entrenador)                         | Existe `invite_first_coach`, el CTA apunta a `/app/{academyId}/coaches` y la ruta existe; se muestra desde el dashboard tras el alta. | No hay paso separado dentro del formulario owner; se conserva el handoff al dashboard. |
| first class skipeable                              | El panel avanzado permite dejar `starterGroupsByVariant` vacío; la API omite grupos y clases starter cuando no hay selección. | El comportamiento es poco descubrible; debe comunicarse explícitamente como opcional/saltear por ahora. |
| first class retomable                              | Tras omitir la plantilla, el alta redirige al dashboard y `DashboardOnboardingPanel` apunta a `/app/{academyId}/groups`; después permite configurar `/classes`. | Debe quedar cubierto por test de contrato para evitar que un cambio vuelva a dejar al owner sin siguiente paso. |
| navegación al siguiente paso                       | POST owner y claim redirigen a `/app/{academyId}/dashboard`; el dashboard carga checklist y CTA contextual. | No usar `/app` legacy ni `NEXT_STEP_URLS` de emails como destino del alta; validar el contrato dashboard → groups/classes/coaches. |

### Verificación adicional

- `git log -S 'OwnerClaimCard'` → solo aparece en commits docs (ZAL-396, ZAL-336, ZAL-157, ZAL-138). NO hay commit de feature que añada el componente.
- `git log -S 'findClaimableAcademyByEmail'` → mismo resultado (solo docs).
- `git log -S 'owner/claim'` → mismo resultado (solo docs).
- El trabajo claim sí está en el árbol actual en el commit `045dde0c` (el changelog histórico cita otro SHA de una rama anterior; se debe verificar siempre contra el checkout actual antes de cerrar).
- La auditoría actual es read-first y no implica producción, sandbox, cuentas reales, cambios de pricing ni publicación externa.

### Contratos que sí existen (reusables)

- `academies.contactEmail text` + `academies_contact_email_idx` → query directa con `lower()` o `ilike`.
- `academies.ownerId` FK → `profiles.id` (cascade on delete).
- `academies.tenantId` → reusar en el claim, NO generar nuevo.
- `withTenant` wrapper (`src/lib/authz.ts`) → `withTenant` para endpoints tenant-scoped; el POST de claim es per-user (auth.getUser), no tenant-scoped al inicio (porque el claim CREA el tenant context).
- `apiSuccess`/`apiCreated`/`apiError` → respuestas estandarizadas.
- `getOptionalEnvVar("DISABLE_ONBOARDING_AUTOMATIONS")` → skip automation en test.

## Plan de implementación mínimo (read-first → change)

Siguiendo el principio de cambios mínimos:

1. **Claim** — ya implementado; verificar contrato y conservar el límite one-academy.
2. **Invite** — conservar el handoff al dashboard y verificar la ruta real de coaches, sin duplicar el endpoint de invitaciones.
3. **First class** — hacer explícito en el formulario que la plantilla es opcional y que puede retomarse desde el dashboard; no cambiar la transacción de creación más allá de lo necesario.
4. **Navegación** — fijar en tests que alta/claim llegan al dashboard y que el CTA pendiente apunta a groups/classes/coaches según el estado.
5. **Verificación local** — suite focal del paquete web, typecheck/lint dirigidos y evidencia separada de validación humana/producción.

## Lo que NO se hace (scope guard)

- No se inventa multi-academy (un owner = una academia).
- No se añade billing/cobros al onboarding.
- No se abre athlete self-serve.
- No se modifica `resolveUserHome` ni RLS.
- No se cambian los redirects existentes para usuarios que ya tienen academia.
