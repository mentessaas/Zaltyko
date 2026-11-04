# Diagnóstico de reapertura familiar en Firefox — 2026-11-04

## Hallazgo

PR234, candidato `dba6c7fb150e642809de6fe9011121a52c2a04c4`: CI principal [41824497133](https://github.com/mentessaas/Zaltyko/actions/runs/41824497133) terminó en FAILURE. Chromium y WebKit SUCCESS; Firefox falla al volver a abrir el editor de asociación familiar después del PATCH persistido del tutor y una recarga. La aserción observa `aria-expanded=false`; no se observa la respuesta de `GET /api/v1/owner/families/options`. Required gate FAILURE. CI aislada41824521126, Static41824496800, Directory41824496778 y GitGuardian SUCCESS. Jobs condicionales omitidos no acreditan aceptación alojada.

## Revisión y cambio

La captura sintética muestra el editor cerrado; no acredita una causa. El botón ya está protegido por `interactive` y el callback del perfil de tutor no ejecuta `router.refresh`. No se modifica producto basándose en esas hipótesis.

El siguiente candidato instrumenta solamente la prueba: metadatos acotados de interacción DOM, identidad numérica y conexión del botón, mutaciones de `aria-expanded`/`disabled`, ruta fija de opciones y presencia booleana de errores, sin mensajes libres. No guarda nombres, valores de formularios, query strings, cabeceras, cuerpos, cookies ni estado de sesión. El JSON se escribe solo para una prueba fallida o una violación del control de red; se omiten mensajes libres y rutas ajenas a las dos permitidas, y de la red solo se guardan recuentos. El workflow conserva ese JSON y las capturas únicamente ante fracaso, durante tres días. Traces, vídeos, HTML y logs de red crudos quedan excluidos.

Se conservan operaciones, aserciones, tiempos de espera, matriz de tres navegadores y gate obligatorio. No se añaden reintentos, esperas ni clicks auxiliares. Es un candidato diagnóstico, no una corrección funcional. Una ejecución posterior verde, por sí sola, no determina la causa del fallo anterior.

## Importancia y siguiente paso

Obtener evidencia remota del mismo recorrido para distinguir click ausente, estado restablecido o desmontaje. Revisar el resultado antes de afirmar resuelto el defecto. Backend y QA trabajan por separado en un verificador puro de consistencia de exportación parcial, fuera de este candidato; no habilita restauración, supresión ni nuevos endpoints.

No se aplicó SQL alojado ni se tocó producción, Live, proveedores o ensayo. No se ejecutaron pruebas, builds, instalaciones o servicios en el Mac. Las comprobaciones locales se limitaron a lectura y `git diff --check`.
