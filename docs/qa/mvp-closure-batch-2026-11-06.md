# Cierre incremental — correo aislado, Personal y diagnóstico de datos

## Alcance

Lote preparado desde c32a7e448572db642c177199f9e6d728b1643ec6. El usuario autoriza continuar estos frentes y preparar la propuesta fiscal para mostrarla después al gestor. No autoriza SQL alojado, Live, producción o ensayo; todos los builds y suites serán remotos. Los borradores legales y fiscales locales siguen fuera de este candidato de producto.

## Cambios previstos y responsables

- Backend: adaptador QA de correo exclusivo de entregas, OFF por defecto, sin habilitar BREVO_API_KEY global. La solicitud principal permanece persistida aunque el envío no se autorice o no pueda acreditarse. Un intento persistente por permiso, actor/contexto/mensaje exactos y ventana acotada. Ninguna prueba real de recepción o credencial se da por hecha.
- Owner: al cambiar de academia, Personal descarta borradores/recibos/avisos del contexto anterior y conserva separado su comando incierto. Invitaciones siguen OFF, sin nuevos roles, cuentas ni grants.
- Datos: diagnóstico puro de disposición a partir de un archivo canónico validado. Reutiliza el verificador y las comprobaciones relacionales; no confunde valores excluidos, conteos desconocidos o campos omitidos con ausencia actual. Nunca ejecuta ni autoriza supresión, conservación o recuperación.
- Coordinación: integra únicamente los archivos de este lote, revisa los contratos y conserva el dirty legal/vault anterior. Prepara CI completa y revisión externa del SHA resultante antes de publicación.

## Criterios remotos

1. Correo: guardas OFF y parciales; contexto inválido sin fetch; actor Auth verificado; payload permitido; reserva única bajo concurrencia y nuevos UUID; bajas; timeout/no aceptación; no simulación presentada como envío; persistencia/replay del contacto sin segundo intento. PostgreSQL exclusivamente efímero en GitHub.
2. Personal: navegación A→B→A, sin arrastrar borrador/recibo/notice ni POST automático; comando incierto conservado en A y replay idéntico solo por acción expresa. Mantener denegaciones existentes.
3. Datos: manipulación de hashes, otra academia, relaciones incoherentes aun con checksums recalculados, módulos opcionales ausentes frente a cero declarado, omisiones y fuentes externas desconocidas. Sin valores personales, efectos de red/DB ni autorización simulada desde input.
4. CI completa del SHA exacto: lint, tipos, unitarias, seguridad/RLS/SQL-source, build principal y aislado, PostgreSQL desechable, navegadores y GitGuardian. Los jobs omitidos no acreditan sus recorridos.

## Límites de aceptación

Un transporte mock no acredita recepción real. Un conteo declarado no verifica el estado actual ni autoriza borrar. Un SHA verde no prueba configuración, factura, fiscalidad o contratos. La recuperación general mantiene blocked/restorable=false. Los controles no se rebajan para lograr un PASS.

Configuración de proveedor, credencial exclusiva y un envío real requieren alcance exacto y revisión de aislamiento. No se activan invitaciones ni correo general. Cambios de publicación requieren revisión externa del commit actual; no se publica por el solo hecho de autorizar implementación.

## Estado inicial

Implementación en curso. Sin pruebas/builds ejecutados localmente, sin nuevo commit, CI o despliegue a la fecha de esta preparación. El resultado del lote se documentará en una sección fechada sin convertir los criterios en resultados.

## Revisión estática — 6 de noviembre

Personal corrige el ciclo de vida del editor al cambiar de academia mediante una clave de contexto. Sus regresiones mantienen el comando incierto original separado por academia. Owner revisó independientemente los cuatro archivos del diagnóstico de datos, sin P1/P2: nunca certifica ausencia, estado actual, autorización ni capacidad de borrado. Ninguna de estas revisiones equivale a ejecución de pruebas.

El contrato del correo diferencia el build de Vercel, que expone CI=1, del runtime: la reserva y el envío siguen bloqueados en CI. Esta compatibilidad no habilita el namespace, credenciales, configuración de proveedor ni envío real.

## Primer candidato y correcciones agrupadas

`a197b740`: build principal, lint/tipos, móvil, RLS/migraciones, PostgreSQL desechable, Chromium, Static, Directory y GitGuardian SUCCESS. La CI aislada detecta 5966 unitarias PASS, una FAIL y seis omitidas: la rama simulada de invitaciones comparte clave entre Personal y el panel de acceso; A→B→A duplica el formulario. Se separan las claves por componente conservando la regresión completa. El control de entorno exige además documentar el selector de entregas, ahora con defaultfalse. No se heredan estos PASS al siguiente SHA.

La revisión del emisor común confirma otro defecto: descartaba el resultado de Brevo y podía marcar sent ante simulación o ausencia de aceptación. El arreglo requiere simulated=false e identificador no vacío; un resultado simulado/incompleto conserva el intento como failed y devuelve false sin sentAt ni payload. Errores reales y guardas existentes se conservan. QA revisó independientemente fuente y 30 casos mock, sin P1/P2. No se habilita credencial ni se cambia Brevo. Los callers que ignoran false requieren su propia revisión; este delta no acredita que todos presenten el resultado correctamente.

El siguiente candidato requiere ambas CI completas, build principal y aislado y controles exactos. Sin nuevas pruebas locales, despliegue o configuración de proveedores.
