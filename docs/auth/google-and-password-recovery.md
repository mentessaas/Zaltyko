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

## Configuración externa revalidada — 2026-10-01

- **Google Cloud:** el proyecto Zaltyko tiene el cliente OAuth web `Zaltyko Web`. Su origen JavaScript autorizado es `https://zaltyko.com` y su URI de retorno es `https://jegxfahsvugilbthbked.supabase.co/auth/v1/callback`. El cliente de escritorio anterior se conserva.
- **Supabase Auth:** en el proyecto de producción el proveedor Google está habilitado y el Client ID configurado coincide con `Zaltyko Web`; el secreto existe en el panel, pero su valor no se leyó ni se copia aquí. La URL del sitio es `https://zaltyko.com` y la lista de retorno incluye `https://zaltyko.com/auth/callback` y su variante con query. El callback esperado está permitido.
- **Límite de Google:** la audiencia sigue como externa y el estado de publicación es **Prueba**, con **0 usuarios de prueba**. Por ello no hay una sesión real de Google verificada y las cuentas que no sean testers no podrán completar el acceso. No se publicó la app ni se agregó un tester en esta pasada.
- **Correo de recuperación:** la plantilla de Supabase Reset password utiliza `{{ .ConfirmationURL }}`, compatible con el callback PKCE. Sin embargo, Supabase Auth sigue usando el servicio de correo integrado; el panel recomienda configurar SMTP propio y Supabase documenta que el servicio integrado es solo para pruebas y restringe destinatarios. El flujo de recuperación no se puede considerar listo para usuarios reales hasta configurar SMTP y confirmar entrega. [Guía SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- **Brevo:** las variables `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y `BREVO_SENDER_NAME` aparecen en Vercel Production y Preview; `BREVO_REPLY_TO` falta. Una API key de Brevo no sirve como contraseña SMTP: Supabase Auth requiere host, login y una clave SMTP de Brevo. [Guía SMTP de Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

## Validación y límite

- TypeScript, ESLint, Prettier y pruebas focales de destinos seguros, solicitud de recuperación y actualización de contraseña pasan localmente.
- El formulario solicitó recuperación y el email apareció en Mailpit local.
- Desde login, el nuevo enlace abre la recuperación sin errores de consola; un correo no registrado recibe la misma respuesta genérica. `/reset-password` sin sesión vuelve a recuperación con el aviso de enlace expirado.
- No se pudo completar el clic local: la allowlist del Supabase aislado no incluye `http://localhost:3109/auth/callback` y redirige al `SITE_URL` local `http://127.0.0.1:3000/`. Esto no valida ni invalida la configuración de producción.
- Vercel muestra las variables de Brevo de producción, pero la lectura local no las inyectó y la API de Vercel no devolvió el valor descifrado de la clave. `BREVO_REPLY_TO` tampoco figura configurada. No se envió correo real; no se cambió ni descargó ninguna variable.
- La configuración externa descrita arriba se observó en modo de solo lectura; no se cambió durante esta pasada. No se envió ningún correo real. Para probar recuperación hay que configurar SMTP de Supabase y comprobar el envío a una cuenta propia; para validar el proveedor transaccional de la app se requiere además una clave API Brevo válida, `BREVO_REPLY_TO` y el test propio documentado. La aceptación del proveedor y la recepción en Gmail se registran como pasos distintos.

El catálogo de academias tiene una prueba separada en el PR #174: la búsqueda de ficha aparece tras crear una cuenta nueva en la vista previa de la rama, la API bloquea una sede ya listada y una reclamación queda pendiente de aprobación. Es evidencia de la vista previa, no de producción; los flags de directorio siguen apagados.

## Comprobación después de publicar

1. En una cuenta de prueba propia, solicitar recuperación y confirmar que el mensaje llega.
2. Abrir su enlace y comprobar que llega a `/reset-password`, guardar una contraseña nueva y volver a iniciar sesión.
3. Confirmar que una dirección desconocida recibe la misma respuesta visual y que no sale marketing.
4. Probar los botones Google de login y registro y verificar que vuelven a Zaltyko con la sesión y destino correctos.

Referencias oficiales: [Supabase: Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase: contraseñas](https://supabase.com/docs/guides/auth/passwords), [Supabase: URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls), [Google: OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server).
