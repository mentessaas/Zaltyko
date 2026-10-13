# QA — alta y recuperación Owner canónicas — 2026-10-14

## Hallazgos

- Con alta por email y sesión confirmada, la rama seleccionada explícitamente como `owner` verifica `supabase.auth.getUser()` y navega a `/owner/setup`. No llama a `POST /api/onboarding/profile` ni crea un perfil global legacy.
- Si no puede confirmar la sesión después de que Supabase haya aceptado el alta, lleva al login con `profile_setup=retry`; no repite `signUp`. La recuperación comprueba otra vez la sesión y espera una acción explícita antes de continuar a `/owner/setup`, sin POST al perfil legacy.
- Las altas confirmadas de `coach` y otros roles conservan el POST de perfil existente y su continuación actual. El alta de directorio mantiene su destino propio.
- Se conserva la aceptación visible obligatoria. El registro sigue enviando `legal_consent_version` y `legal_consent_proof`; Google conserva su transporte por el callback existente. Este cambio no trata metadata como autorización ni añade persistencia contractual.
- Magic link y Google desde la recuperación regresan a `/auth/login?profile_setup=retry` con un path interno fijo; un `next` externo no puede sustituirlo.

## Evidencia y alcance

- Fuente: `src/components/RegisterForm.tsx`, `src/components/login-form.tsx`, `src/app/auth/login/page.tsx` y las pruebas focales de registro/login.
- No se modificaron API routes, callback, migraciones, consent store ni `OwnerSetupForm`. No se ejecutó QA E2E autenticado ni contra Supabase remoto.
- **No afirmado:** que el consentimiento contractual esté persistido antes del bootstrap Owner. La integración depende del contrato/gate backend y requiere verificación aparte.
- El requisito adicional de consentimiento en `OwnerSetupPage` / `OwnerSetupForm` queda pendiente del DTO exacto de Backend para el helper de estado y el campo opcional `contractualAcceptance`. Hasta entonces no se añadirá una aceptación duplicada ni se tratará una ausencia/error de estado como aceptación.

## Validación local

- Vitest focal: 5 archivos, 32 pruebas PASS, incluyendo alta Owner sin POST legacy, continuación de coach, errores de sesión/red, reintento sin repetir el alta y retorno interno Google/magic link.
- `pnpm typecheck`, ESLint focal y `git diff --check`: PASS.
- No se ejecutó E2E autenticado. Estas comprobaciones locales no representan un flujo E2E de onboarding.

## Siguiente paso

Integrar el contrato de backend para el consentimiento y comprobar el recorrido de alta real en un stack aislado. La implementación frontend deja al bootstrap canónico resolver la membresía Owner.
