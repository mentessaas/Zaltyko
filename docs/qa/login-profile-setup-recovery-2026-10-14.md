# Recuperación del perfil desde el login — 2026-10-14

## Hallazgos clave

- `/auth/login?profile_setup=retry` ya no deriva automáticamente una sesión activa al resolver de entrada; presenta una confirmación de recuperación dentro del login activo.
- Sin una sesión resuelta por el servidor, la persona inicia sesión con contraseña. El cliente vuelve a verificar la sesión antes de presentar o ejecutar el paso de recuperación.
- El POST existente `/api/onboarding/profile` solo se envía tras una acción explícita y con el body exacto `{ "role": "owner" }`. No se usa `user_metadata` para decidir ni conceder el rol.
- Una respuesta exitosa solo continúa a `/owner/setup` si devuelve `data.role === "owner"`. Los fallos de red se muestran en español, no exponen el error técnico y permiten reintentar.
- El modo de recuperación no muestra un alta nuevo y mantiene contraseña, magic link y Google. Magic link y Google vuelven a `/auth/login?profile_setup=retry` con un destino interno fijo, incluso si el query contiene un `next` externo.

## Fuente y alcance

- Evidencia: `src/app/auth/login/page.tsx`, `src/components/login-form.tsx`, `src/app/api/onboarding/profile/route.ts` y `tests/auth-login-profile-setup-recovery.test.tsx`.
- El endpoint de perfil no se modificó. No se tocaron `RegisterForm`, `OwnerSetupForm`, callback OAuth ni `resolveUserEntry`.
- El esquema actual confirma que `owner_consent.owner_id` referencia `profiles.user_id` (`src/db/schema/owner-consent.ts`). El endpoint actual puede crear/recuperar esa fila de perfil antes del paso de consentimiento.
- **Pendiente de Backend:** gate y persistencia de consentimiento en el bootstrap. Esta rama no modifica ese contrato ni afirma que el onboarding completo esté integrado.
- No se ejecutaron flujos autenticados contra Supabase compartido, Preview o producción.

## Por qué importa

El estado de recuperación en la URL solo solicita que se muestre el flujo. La decisión de crear un perfil de dirección depende de la sesión autenticada y de la confirmación de la persona, sin cambiar APIs ni promover datos de metadata a autoridad.

## Accionable

Sí: probar este camino en el entorno integrado y verificar el contrato de consentimiento de Backend antes de declarar el onboarding completo.

## Siguiente paso

Integrar el login con el gate de consentimiento de Backend cuando se entregue el contrato. La rama contiene únicamente el cambio local de frontend, pruebas y esta nota.
