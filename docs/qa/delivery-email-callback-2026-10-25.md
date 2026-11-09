# Callback y academia QA de entregas

## Hallazgos
Cuenta dedicada creada por humano y confirmación real recibida. Auth confirmó correo a22:50:57.700565UTC; logs del sandbox a22:50:59UTC muestran422 flow_state_expired al intercambiar el código PKCE. No es evidencia de fallo de contraseña ni justifica ampliar seguridad. Se sustituye el aviso genérico para este código por instrucción persistente de iniciar sesión o solicitar recuperación si corresponde. No se afirma que una cuenta arbitraria esté confirmada ni se abre sesión tras error.

Login posterior correcto y academia QA Entregas Zaltyko20261025 creada por UI, sede QA Entregas, organización0242c134-872b-45ca-a2bf-c64ece52a15b. Dashboard muestra nombre y ceros iniciales. Recorrido operativo completo pendiente. Preview observada474369ea; no atribuirle correcciones posteriores.

## Fuente
Supabase query_logs acotado22:50:45–22:51:30UTC, proyectoaeeootdmuiqkfeernskw; documentación oficial errores Auth flow_state_expired; navegador de este chat, correo pertinente y formulario real. Sin tokens/códigos almacenados. Captura /private/tmp/zaltyko-delivery-academy-20261025.png.

## Importancia
Separa confirmación de correo de sesión PKCE y evita recomendar volver a registrar una cuenta ya creada. El login con contraseña permanece disponible. Ensayo intacto.

## Siguiente paso
CI por commit y comprobaciones operativas de la academia exclusiva. No pruebas ni builds locales. No correo adicional ni nueva cuenta necesarios para este diagnóstico.
