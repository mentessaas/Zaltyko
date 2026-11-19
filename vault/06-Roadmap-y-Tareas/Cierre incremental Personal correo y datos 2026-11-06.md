---
status: in_progress
owner: coordinacion
last_reviewed: 2026-11-06
---

# Cierre incremental de Personal, correo y datos

## Hallazgos

Personal conservaba estado visual de otra academia al navegar: se separa el ciclo de vida del editor, manteniendo los comandos inciertos en su academia original. El correo necesita una vía exclusiva de entregas, apagada por defecto, con actor confirmado, mensaje exacto, permiso temporal y una reserva persistente por intento; un mock no acredita recepción. El diagnóstico de datos debe conservar explícitamente las fuentes desconocidas y no autoriza supresión ni recuperación.

## Fuente

docs/qa/mvp-closure-batch-2026-11-06.md y revisiones estáticas Backend, Owner y QA de este lote. Los borradores fiscales para el gestor se mantienen aparte del candidato de producto.

## Importancia

Evitar operaciones bajo el contexto equivocado, envíos repetidos o afirmaciones de borrado y conservación sin evidencia. Las invitaciones permanecen apagadas; no se cambia ningún permiso comercial.

## Siguiente paso

Completar revisión independiente y CI remota del mismo SHA, incluida concurrencia sobre PostgreSQL desechable. Después, revisión externa antes de cualquier publicación. La recepción automática, suplencia humana, reglas fiscales, aceptación contractual y procedimientos integrales de datos siguen pendientes de sus respectivas verificaciones. Sin SQL alojado, Live, producción, ensayo ni builds/tests locales.

## Corte del primer candidato

a197b740 pasa PostgreSQL desechable, build principal, tipos y Chromium; no completa la CI por documentación de una variable y una regresión real de claves duplicadas en la rama simulada de invitaciones. Se corrigen ambos sin bajar controles. Se incorpora además un arreglo revisado del emisor común: simulación o respuesta sin aceptación ya no serán sent/true. El código no configura proveedores, no habilita invitaciones y no acredita recepción de correo. Las comprobaciones del candidato definitivo siguen pendientes.

## Corte 2895f605 — WebKit

Unitarias5998PASS/6omitidas, ambos builds y PostgreSQL desechable pasan, también Chromium y Firefox3/3, seguridad y controles estáticos. WebKit pasa Owner operativo pero falla esperando alert de contacto asistido; Personal queda sin ejecutar. Captura: botón detrás de cabecera fija. Sin evidencia del primer POST ni defecto funcional demostrado. Se ajusta únicamente posición antes del click nativo y observación/diagnóstico sintético, conservando todas las aserciones. No se atribuye una causa exclusiva ni se declara listo para publicar hasta conciliar el nuevo SHA.

## Resultado final remoto51cf5272

AmbasCI42139731024/42139740099SUCCESS, dos builds, unitarias5998PASS6omitidas, Chromium/Firefox/WebKit3/3 yRequiredGateSUCCESS. Static/Directory/GitGuardianSUCCESS. Siete jobs omitidos no acreditan sus recorridos. GitHubREVIEW_REQUIRED; no publicación ni SQL/Live/producción/ensayo. Resultado anotado localmente sin nuevo commit para conservar el candidato revisable. Brevo leído en cuenta exacta: dominio autenticado/verificado yremitenteactivo; no envío ni aislamiento de credencial acreditados. Expediente fiscal y factura borrador preparados para asesor. Recepción real y procedimientos integrales de datos siguen pendientes; diagnóstico no ejecuta supresión/recuperación.

## Publicación de entregas y aceptación incremental

Revisión externa APPROVED de elvisvaldes sobre51cf5272, 6nov06:53:13Z. Un único build remoto de entregas pasa aislamiento/240pruebas/tipos/Next237s/artefacto; READYdpl_4qZpB7d86oPmhXjNh2nN4DEoS9dp. Alias de entregas trasladado después de comprobar login directo hidratado; anteriorc32 conservado. Manager limitado mantiene su sede; Personal404 y APIs Personal/export403. Acceso de equipoFEATURE_NOT_AVAILABLE/503, invitacionesOFF. Panel sin desborde DOM a375/768/1280; no acredita editorOwner ni todos los formularios. Preparada sesiónOwnerQA A para aceptación pendiente. CorreoOFF, sin credencial/envío. Especialista entrega propuesta de alcance Brevo, sin configurar. Evidencia externa delivery-51cf5272-publication.md. Sin SQL/Live/producción/ensayo ni builds/testsMac; HEAD intacto.

## Aceptación Owner QA A de Personal

SesiónOwner disponible y conservada. Más→Personal abre contextoA, estado vacío y formulario sin acceso/invitación. APIAok/items0; filtrosArchivados/Todos/Activos yActualizar generan solo4GET deA. B ajena devuelveAPI403/página404. Controles44px dentro de375/768/1280, scrollWidth igual alviewport; capturas completas y overrides retirados. Sin crear perfiles ni enviar/invitar. La sesión solo autorizaA: el cambioSPA entre dos academias autorizadas continúa acreditado únicamente en la regresión sintética de CI; no se sustituye por hardnavigation/404. RevisiónQA independiente ratifica ese límite. Evidencia externa personal-51cf5272-owner-acceptance.md. No nuevos cambios de producto, CI, SQL, Live, producción, ensayo ni pruebasMac.
