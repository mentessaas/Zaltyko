# QA — alta y recuperación Owner canónicas — 2026-10-14

## Hallazgos

- Con alta por email y sesión confirmada, la rama seleccionada explícitamente como `owner` verifica `supabase.auth.getUser()` y navega a `/owner/setup`. No llama a `POST /api/onboarding/profile` ni crea un perfil global legacy.
- Si no puede confirmar la sesión después de que Supabase haya aceptado el alta, lleva al login con `profile_setup=retry`; no repite `signUp`. La recuperación comprueba otra vez la sesión y espera una acción explícita antes de continuar a `/owner/setup`, sin POST al perfil legacy.
- `OwnerSetupForm` recibe el DTO serializable `contractualConsent`. Con `requiresAcceptance: false` no muestra otra casilla ni añade aceptación al payload. Si es `true`, la casilla empieza desmarcada, enlaza los términos y la política ya existentes y solo añade `{ accepted: true, policyVersion }` tras marcarla.
- `OwnerSetupPage` valida la sesión con `auth.getUser()` y consulta `getOwnerContractualConsentRequirement(user)`. Si el usuario no se puede verificar, redirige al login; si la lectura de política/consentimiento falla, pasa un estado nulo y `OwnerSetupForm` falla cerrada sin exponer envío.
- Las altas confirmadas de `coach` y otros roles conservan el POST de perfil existente y su continuación actual. El alta de directorio mantiene su destino propio.
- Se conserva la aceptación visible obligatoria. El registro sigue enviando `legal_consent_version` y `legal_consent_proof`; Google conserva su transporte por el callback existente. Este cambio no trata metadata como autorización ni añade persistencia contractual.
- Magic link y Google desde la recuperación regresan a `/auth/login?profile_setup=retry` con un path interno fijo; un `next` externo no puede sustituirlo.

## Evidencia y alcance

- Fuente: `src/components/RegisterForm.tsx`, `src/components/login-form.tsx`, `src/app/auth/login/page.tsx`, `src/app/owner/setup/page.tsx`, `OwnerSetupForm` y pruebas focales.
- El merge de Backend proporciona el helper/DTO y el campo opcional de bootstrap. Esta rama solo consume ese contrato; no modifica rutas API, callback, migraciones ni consent store.
- **No afirmado:** que el consentimiento esté persistido en un entorno integrado antes del bootstrap Owner. No se ejecutó QA E2E autenticado ni contra Supabase remoto.

## Validación local

- Vitest focal del bloque de registro/login/setup: 8 archivos, 33 pruebas PASS. Incluye alta Owner sin POST legacy, continuación de coach, recuperación, aceptación condicional, idempotencia, lectura autenticada de la página y fail-closed sin DTO.
- `pnpm typecheck`, ESLint focal, Prettier y `git diff --check`: PASS.
- No se ejecutó E2E autenticado. Estas comprobaciones locales no representan un flujo E2E de onboarding.

## Siguiente paso

Probar las seis razones del helper y el recorrido de alta en un stack aislado tras integrar el commit Backend. La implementación frontend deja al bootstrap canónico resolver la membresía Owner.
