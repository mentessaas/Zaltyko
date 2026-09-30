# Acceso con Google y recuperación de contraseña

## Estado observado el 2026-09-30

- Producción sirve `/auth/login`, pero no mostraba un enlace para recuperar la contraseña.
- El botón de Google en inicio de sesión y el de registro, tras aceptar los términos, terminan en el error de Google `redirect_uri_mismatch`.
- La URL del proyecto Supabase de producción se consulta en su panel; el identificador de proyecto no es un secreto ni debe copiarse a una clave OAuth.
- No se ha cambiado la configuración de Google Cloud ni Supabase en producción.

## Cambio preparado

- `/auth/login` enlaza a `/auth/forgot-password` y conserva un destino interno seguro.
- La solicitud de recuperación responde igual para direcciones existentes y desconocidas.
- El email de recuperación apunta al callback PKCE de la aplicación; el callback conserva el destino hacia `/reset-password`.
- La página de cambio de contraseña exige una sesión válida, comprueba confirmación y mínimo de 8 caracteres, y actualiza la contraseña mediante Supabase Auth.
- El acceso Google desde login navega a la URL devuelta por Supabase y muestra errores si no existe URL. El registro ya usa este patrón.

## Configuración externa pendiente

En el cliente OAuth web de Zaltyko en Google Auth Platform, agregar como **Authorized redirect URI**:

`https://<PROJECT_REF>.supabase.co/auth/v1/callback`

Conservar los valores existentes. Confirmar que **Authorized JavaScript origins** incluye `https://zaltyko.com`.

En Supabase Auth → URL Configuration, agregar a **Redirect URLs**:

`https://zaltyko.com/auth/callback`

Confirmar que la plantilla de recuperación utiliza el enlace de confirmación de Supabase y que SMTP de producción está activo. No compartir el secreto OAuth ni la clave SMTP para completar esta configuración.

## Validación y límite

- TypeScript, ESLint, Prettier y pruebas focales de destinos seguros, solicitud de recuperación y actualización de contraseña pasan localmente.
- El formulario solicitó recuperación y el email apareció en Mailpit local.
- Desde login, el nuevo enlace abre la recuperación sin errores de consola; un correo no registrado recibe la misma respuesta genérica. `/reset-password` sin sesión vuelve a recuperación con el aviso de enlace expirado.
- No se pudo completar el clic local: la allowlist del Supabase aislado no incluye `http://localhost:3109/auth/callback` y redirige al `SITE_URL` local `http://127.0.0.1:3000/`. Esto no valida ni invalida la configuración de producción.
- Vercel muestra las variables de Brevo de producción, pero la lectura local no las inyectó y la API de Vercel no devolvió el valor descifrado de la clave. `BREVO_REPLY_TO` tampoco figura configurada. No se envió correo real; no se cambió ni descargó ninguna variable.
- No se cambió la configuración de producción. Para validar entrega real hace falta ejecutar el verificador en un entorno autorizado que pueda usar la clave de Brevo, con el destinatario propio `Zaltyko@gmail.com`; la aceptación del proveedor y la recepción en Gmail se registran como pasos distintos.

El catálogo de academias tiene una prueba separada en el PR #174: la búsqueda de ficha aparece tras crear una cuenta nueva en la vista previa de la rama, la API bloquea una sede ya listada y una reclamación queda pendiente de aprobación. Es evidencia de la vista previa, no de producción; los flags de directorio siguen apagados.

## Comprobación después de publicar

1. En una cuenta de prueba propia, solicitar recuperación y confirmar que el mensaje llega.
2. Abrir su enlace y comprobar que llega a `/reset-password`, guardar una contraseña nueva y volver a iniciar sesión.
3. Confirmar que una dirección desconocida recibe la misma respuesta visual y que no sale marketing.
4. Probar los botones Google de login y registro y verificar que vuelven a Zaltyko con la sesión y destino correctos.

Referencias oficiales: [Supabase: Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase: contraseñas](https://supabase.com/docs/guides/auth/passwords), [Supabase: URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls), [Google: OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server).
