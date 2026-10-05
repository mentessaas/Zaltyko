# Acceso con Google y recuperación de contraseña

## Smoke de producción — 2026-10-05

- En `https://zaltyko.com/auth/login`, el enlace de recuperación aparece y el botón Google se habilita al terminar la hidratación.
- En una sesión de navegador aislada y sin credenciales, al pulsar el botón la página llegó a la pantalla oficial de inicio de sesión de Google. La solicitud utilizó el cliente web `Zaltyko Web` y el callback `https://jegxfahsvugilbthbked.supabase.co/auth/v1/callback`; no apareció `invalid_client` ni `redirect_uri_mismatch`.
- Google Auth Platform conserva el cliente `Zaltyko Web` como tipo Aplicación web, con origen `https://zaltyko.com` y el callback anterior. El cliente antiguo de escritorio permanece separado. No se creó un cliente duplicado ni se leyó, rotó o modificó ningún secreto.
- En `/auth/register`, el botón Google permanece deshabilitado hasta que la persona acepta los términos y confirma haber leído la política de privacidad. No se marcó esa casilla en nombre del usuario.
- Supabase Auth muestra SMTP personalizado activo con `smtp-relay.brevo.com`, puerto 587, remitente y contraseña guardada/enmascarada. No se leyó ni cambió la contraseña SMTP.
- Los registros transaccionales de Brevo, filtrados a la dirección de prueba facilitada, contienen pruebas anteriores con eventos **Enviado**, **Entregado** y **Abierto** del 3–4 de octubre. Esto valida el proveedor y la recepción de sus mensajes de prueba.
- El 5 de octubre se solicitó recuperación para esa dirección. Supabase devolvió HTTP 200 y la respuesta genérica prevista, pero no apareció un evento Brevo nuevo correspondiente. Supabase documenta que no envía un correo cuando no encuentra una cuenta asociada aunque la petición no devuelva error; no comprobamos si existe la cuenta. Por ello, el envío de recuperación concreto sigue sin estar verificado.
- **Alcance OAuth:** esta prueba demuestra que el flujo de login llega al proveedor; no completa una autenticación, no valida el retorno con sesión ni crea una cuenta. Esas comprobaciones requieren una cuenta de prueba Google autorizada y, para registro, la aceptación expresa de los términos por esa persona.
- Referencia: [Google — OAuth 2.0 para aplicaciones web de servidor](https://developers.google.com/identity/protocols/oauth2/web-server), que exige que el URI de redirección coincida exactamente con el registrado.
- Referencias de correo: [Supabase — contraseñas y recuperación](https://supabase.com/docs/guides/auth/passwords) y [Brevo — registros transaccionales](https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews).

## Revalidación en producción — 2026-10-02

- PR #179 se fusionó en `main` (`364e8693`) y su deployment de producción está `READY`, con alias `zaltyko.com` y `www.zaltyko.com`. Login, registro y recuperación responden HTTP 200.
- Google Cloud muestra el cliente web `Zaltyko Web` con origen `https://zaltyko.com` y callback de proveedor `https://jegxfahsvugilbthbked.supabase.co/auth/v1/callback`; el cliente de escritorio se conserva. No se creó otro cliente ni se cambió el secreto.
- Supabase Auth de producción tiene Google habilitado con el mismo Client ID y un secreto guardado (campo enmascarado); `https://zaltyko.com/auth/callback` y su variante con query están en la allowlist de retorno. La URL del sitio es `https://zaltyko.com`.
- Una petición pública sin sesión confirma que el enlace “¿Olvidaste tu contraseña?” aparece y apunta a `/auth/forgot-password`. Los botones Google llegan a Google con `openid email profile`; no se inició sesión con una cuenta real ni se creó una cuenta nueva. El formulario de registro exige aceptar términos antes de continuar.
- Revalidación adicional en navegador Playwright aislado: tras esperar a que hidrate la página, “Entrar con Google” llama al endpoint de autorización de Supabase (HTTP 302), que redirige a `accounts.google.com` (HTTP 302 y pantalla oficial, HTTP 200). No apareció `invalid_client` ni `redirect_uri_mismatch`.
- También se reprodujo una carrera real de interfaz: un clic antes de hidratar JavaScript no ejecutaba el controlador. Se corrigió localmente en `fix/google-oauth-hydration`: login y registro muestran “Preparando Google...” y mantienen el botón desactivado hasta que el cliente esté listo. En registro, `next` se deriva después de hidratar. Prueba SSR/hidratación 4/4, ESLint focal y `pnpm typecheck` pasan; falta CI, despliegue y verificación.
- La configuración ya estaba completa: cliente web `Zaltyko Web` existente, mismo Client ID que Supabase y secreto presente/enmascarado. No se creó un duplicado ni se leyó, rotó o cambió el secreto. El callback final requiere que el usuario complete el acceso con su propia cuenta.
- La pantalla de recuperación no se envió en producción: todavía falta configurar y validar SMTP de Supabase. No hay evidencia actual de recepción de un correo de recuperación.

## Estado observado el 2026-09-30 (antes de la corrección productiva)

- Producción sirve `/auth/login`, pero no mostraba un enlace para recuperar la contraseña.
- El botón de Google en inicio de sesión y el de registro, tras aceptar los términos, terminan en el error de Google `redirect_uri_mismatch`.
- La URL del proyecto Supabase de producción se consulta en su panel; el identificador de proyecto no es un secreto ni debe copiarse a una clave OAuth.
- En esa fecha aún no se había cambiado la configuración de Google Cloud ni Supabase; el cliente web y la allowlist se revisaron después, el 2026-10-01.

## Cambio preparado

- `/auth/login` enlaza a `/auth/forgot-password` y conserva un destino interno seguro.
- La solicitud de recuperación responde igual para direcciones existentes y desconocidas.
- El email de recuperación apunta al callback PKCE de la aplicación; el callback conserva el destino hacia `/reset-password`.
- La página de cambio de contraseña exige una sesión válida, comprueba confirmación y mínimo de 8 caracteres, y actualiza la contraseña mediante Supabase Auth.
- El acceso Google desde login navega a la URL devuelta por Supabase y muestra errores si no existe URL. El registro ya usa este patrón.

## Configuración externa revalidada — 2026-10-01

- **Google Cloud:** el proyecto Zaltyko tiene el cliente OAuth web `Zaltyko Web`. Su origen JavaScript autorizado es `https://zaltyko.com` y su URI de retorno es `https://jegxfahsvugilbthbked.supabase.co/auth/v1/callback`. El cliente de escritorio anterior se conserva.
- **Supabase Auth:** en el proyecto de producción el proveedor Google está habilitado y el Client ID configurado coincide con `Zaltyko Web`; el secreto existe en el panel, pero su valor no se leyó ni se copia aquí. La URL del sitio es `https://zaltyko.com` y la lista de retorno incluye `https://zaltyko.com/auth/callback` y su variante con query. El callback esperado está permitido.
- **Google para usuarios:** la audiencia externa se cambió a **En producción** en Google Auth Platform el 2026-10-01. Antes se verificó que la marca incluye soporte, homepage, política de privacidad y términos; la solicitud productiva observada incluye `openid email profile`, sin scopes sensibles o restringidos configurados. Google Cloud confirma que la app está disponible para cualquier cuenta Google. [Audiencia OAuth de Google](https://support.google.com/cloud/answer/15549945?hl=en).
- **Correo de recuperación:** la plantilla de Supabase Reset password utiliza `{{ .ConfirmationURL }}`, compatible con el callback PKCE. Sin embargo, Supabase Auth sigue usando el servicio de correo integrado; el panel recomienda configurar SMTP propio y Supabase documenta que el servicio integrado es solo para pruebas y restringe destinatarios. El flujo de recuperación no se puede considerar listo para usuarios reales hasta configurar SMTP y confirmar entrega. [Guía SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- **Brevo:** las variables `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y `BREVO_SENDER_NAME` aparecen en Vercel Production y Preview; `BREVO_REPLY_TO` falta. Una API key de Brevo no sirve como contraseña SMTP: Supabase Auth requiere host, login y una clave SMTP de Brevo. [Guía SMTP de Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

## Validación y límite

- TypeScript, ESLint, Prettier y pruebas focales de destinos seguros, solicitud de recuperación y actualización de contraseña pasan localmente.
- El formulario solicitó recuperación y el email apareció en Mailpit local.
- Desde login, el nuevo enlace abre la recuperación sin errores de consola; un correo no registrado recibe la misma respuesta genérica. `/reset-password` sin sesión vuelve a recuperación con el aviso de enlace expirado.
- No se pudo completar el clic local: la allowlist del Supabase aislado no incluye `http://localhost:3109/auth/callback` y redirige al `SITE_URL` local `http://127.0.0.1:3000/`. Esto no valida ni invalida la configuración de producción.
- Vercel muestra las variables de Brevo de producción, pero la lectura local no las inyectó y la API de Vercel no devolvió el valor descifrado de la clave. `BREVO_REPLY_TO` tampoco figura configurada. No se envió correo real; no se cambió ni descargó ninguna variable.
- En producción, Playwright comprobó que `/auth/login` y `/auth/register` cargan y que sus botones Google redirigen a Google con el cliente web, el callback de Supabase y `openid email profile`. No se introdujeron credenciales ni se completó una sesión autenticada; el retorno y la creación de cuenta todavía requieren validación manual con una cuenta autorizada del usuario.
- La audiencia de Google se publicó en Producción tras revisar la marca, los enlaces legales, los dominios y los permisos; el Client ID y el secreto de Supabase no se modificaron en esta pasada. No se envió ningún correo real. Para probar recuperación hay que configurar SMTP de Supabase y comprobar el envío a una cuenta propia; para validar el proveedor transaccional de la app se requiere además una clave API Brevo válida, `BREVO_REPLY_TO` y el test propio documentado. La aceptación del proveedor y la recepción en Gmail se registran como pasos distintos.

El directorio y la búsqueda previa del alta se integraron en `main` mediante PR #174. La búsqueda y la reclamación se probaron en local/sandbox; producción no está migrada y sus flags siguen apagados.

## Siguientes verificaciones reales

1. En una cuenta de prueba propia, solicitar recuperación y confirmar que el mensaje llega.
2. Abrir su enlace y comprobar que llega a `/reset-password`, guardar una contraseña nueva y volver a iniciar sesión.
3. Confirmar que una dirección desconocida recibe la misma respuesta visual y que no sale marketing.
4. Probar los botones Google de login y registro y verificar que vuelven a Zaltyko con la sesión y destino correctos.

Referencias oficiales: [Supabase: Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase: contraseñas](https://supabase.com/docs/guides/auth/passwords), [Supabase: URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls), [Google: OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server).
