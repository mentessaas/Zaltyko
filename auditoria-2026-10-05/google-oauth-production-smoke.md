# Google OAuth: comprobación del flujo publicado — 2026-10-05

## Hallazgos clave

- Login de producción muestra recuperación de contraseña y, tras la hidratación, habilita «Entrar con Google».
- El clic anónimo llega a la pantalla oficial de Google con el cliente Web y el callback de Supabase esperados; no se observó `invalid_client` ni `redirect_uri_mismatch`.
- Registro exige aceptación expresa de términos y política antes de habilitar Google. La casilla no se marcó.
- La autenticación no se completó: no se usaron credenciales, no se creó cuenta y no se comprobó callback con sesión.

## Fuentes y evidencia

- Producción: `https://zaltyko.com/auth/login` y `https://zaltyko.com/auth/register` comprobados en Playwright CLI el 2026-10-05.
- Google Auth Platform del proyecto Zaltyko: el cliente `Zaltyko Web` figura como Aplicación web, con origen `https://zaltyko.com` y URI `https://jegxfahsvugilbthbked.supabase.co/auth/v1/callback`; el cliente de escritorio es distinto.
- La página de Google presentó el formulario de acceso y el ID de cliente de `Zaltyko Web`; el flujo no devolvió errores de cliente o redirección. [Documentación oficial de Google](https://developers.google.com/identity/protocols/oauth2/web-server): los URI de redirección deben coincidir con los registrados.
- Supabase mantiene Google Enabled según lectura actual del dashboard. No se abrió el formulario del proveedor, ni se leyeron o cambiaron secretos.

## Por qué importa

El bloqueo de inicio antes de llegar a Google ya no se reproduce en la ruta de login publicada. El éxito completo del proveedor y la creación de una cuenta dependen de completar la interacción de la persona en Google. En registro, aceptar los términos es un acto expreso del usuario y no debe simularse.

## Accionable y siguiente paso

- **Accionable:** sí.
- **Cerrado:** cliente web, origen, callback y apertura del flujo desde login.
- **Pendiente:** prueba autenticada con una cuenta Google de prueba autorizada y, por separado, aceptación real de términos para el registro. No usar una identidad personal para crear un usuario productivo sin autorización expresa específica.
- **Correo:** no se envió un correo de recuperación; SMTP y recepción continúan sin validación real.
