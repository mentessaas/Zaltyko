# Alta Owner — brecha de evidencia del MVP

## Hallazgo verificado

Issue #227 exige crear cuenta y academia. Las pruebas existentes no acreditan
una cuenta Supabase real creada por UI y seguida de bootstrap greenfield:

- `tests/e2e-register-roles-ui.spec.ts` comprueba visibilidad y atributos, no
  envía el registro.
- `tests/e2e-zaltyko-utm-signup.spec.ts` usa la cookie de autenticación mock,
  `/onboarding/owner` y tablas `public.academies`; no equivale al flujo canónico.
- `tests/e2e-owner-local-setup.spec.ts` provisiona usuario sintético mediante
  Supabase Admin antes de login. Es útil para operar, pero no prueba signup.

Estado: **NO VERIFICADO**. No se ha cambiado autenticación para obtener verde.

## Prueba de aceptación pendiente

1. Supabase local desechable y Next real; sin keys ni datos remotos.
2. Abrir registro Owner y completar identidad sintética, contraseña y las
   aceptaciones explícitas exigidas; no conceder analítica por defecto.
3. Observar respuesta real de signup; si requiere confirmación, recuperar el
   correo solo del buzón local y completar su enlace, sin desactivar controles.
4. Crear organización/sede por UI y comprobar entrada Owner y permiso inicial.
5. Verificar lectura de evidencia de consentimiento y ausencia de acceso a
   otra organización. No sembrar organización/membership por SQL para superar
   el test ni usar metadatos de usuario como autorización.
6. Destruir stack/volúmenes temporales, sin exportar sesión ni fixtures reales.

El recorrido operativo con una cuenta provisionada debe reportarse por
separado. El cierre comercial necesita ambos resultados.
