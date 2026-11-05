# Prueba cerrada de recuperación de una ficha sintética

## Hallazgos y alcance

El siguiente incremento de G7 prueba una operación real en PostgreSQL desechable de GitHub, sin publicar un importador. El helper existe únicamente bajo `tests/`: crea y posee dos organizaciones sintéticas, su identidad Auth compartida y una ficha sin familia, grupos, inscripciones o ledger. No acepta archivos, IDs, SQL, credenciales o destinos elegidos por un consumidor. Los únicos escenarios seleccionables son variantes fijas de datos sintéticos.

Guarda GitHub/Linux/flag/loopback y configuración antes de importar la base de datos; revalida antes de usarla y comprueba la sesión real. Conserva las guardas del runner. El parámetro local TLS y el rol inicial deben coincidir con el cluster efímero existente; esto no modifica permisos, TLS ni credenciales alojados.

## Fuentes y pruebas preparadas

- `tests/helpers/canonical-athlete-recovery-rehearsal.ts`: export real intacto, dependencia y proyección fija, captura de precisión contra originales SQL, pérdida de sus dos filas, recuperación transaccional y cleanup de sus propios IDs. Sin ruta, CLI ni consumidor de producto.
- `tests/canonical-athlete-recovery-pg.test.ts`: guardas negativas, recuperación con valores poblados y nulos, IDs ocupados en ambas academias, replay sin duplicados, fallo controlado después de confirmar el INSERT real de persona y snapshots de Auth/todas las tablas canónicas.
- `scripts/ci/verify-sandbox-schema-replay.sh`: ejecuta la suite exclusivamente en el replay remoto efímero, manteniendo el resto de comprobaciones. `vitest.config.ts`: la excluye cuando no está seleccionado ese destino.

Los snapshots deben comprobar la pérdida y recuperación exactas de las dos filas de la fixture y conservar íntegros todos los demás registros, incluidos identidad compartida, scopes, historia financiera, auditoría y outbox. El failpoint es una excepción del propio helper después del primer INSERT: prueba rollback transaccional, no un conflicto concurrente de importadores de producto.

## Precisión e importancia

La exportación parcial actual convierte timestamps de PostgreSQL a Date/JSON de milisegundos. La prueba positiva usa timestamps alineados a milisegundos, distintos entre creación y actualización. La variante con microsegundos mide la pérdida contra los originales todavía presentes y debe rechazar tanto pérdida como recuperación de esa fixture, sin reparar o resellar el archivo. Un archivo aislado no puede acreditar la precisión que su origen perdió.

Este resultado solo puede acreditar esa ficha privada y esos escenarios. No demuestra recuperación integral, archivos externos, catálogos, Auth/Storage/legacy, retención/supresión, autorizaciones productivas, copias reales ni RPO/RTO. El preflight general sigue bloqueado y `restorable=false`. No modifica el exportador ni convierte su salida parcial en backup integral.

## Siguiente paso y estado

Revisión estática independiente y ejecución remota exacta pendientes al preparar este documento. Nada se ejecuta en Mac. Root registrará el SHA, job y resultado real en la auditoría externa, distinguiendo tests preparados, ejecutados y omitidos. No SQL alojado, producción, Stripe Live, ensayo natural, nuevos accesos ni proveedores. La preview de entregas permanece en63c64487 con invitaciones apagadas.

## Ajuste del contrato de sesión después de la primera ejecución

El primer replay 42107177373/127524955878 rechazó nueve escenarios positivos en la guarda antes de crear fixtures; 18 negativos pasaron. El log del CLI mostraba su rol efectivo postgres, pero no los campos de la conexión Node; no se atribuye una causa individual sin evidencia. El helper normaliza la dirección con host(inet_server_addr()), exige login supabase_admin superuser y solo permite las parejas completas supabase_admin/none (efectivo superuser) o postgres/postgres (efectivo no superuser), manteniendo DB, TCP loopback, puerto y replicación origin exactos. No ejecuta SET ROLE ni cambia permisos.

Trece casos adicionales rechazan parejas mezcladas, privilegios incoherentes y destinos distintos. Ante un rechazo de sesión, el diagnóstico solo expone ocho booleanos fijos, nunca URL, credenciales o valores raw. Cuarenta casos quedan preparados para el replay; Backend y QA revisaron estáticamente el delta sin P1/P2. El nuevo resultado remoto continúa pendiente.

## Transporte nativo del runner

El replay08cab809/42108041222/127528396945 obtuvo31PASS y9rechazos: login, privilegios, pares de rol, base de datos y replicación pasaron; transporte y puerto no. El runner existente ya admite el backend Unix de su stack nativo, observado en su log. El helper refleja ahora ese mismo contrato: TCP loopback y puerto exacto, o ambos campos SQL nulos juntos. Rechaza nulos parciales, hosts remotos y puertos distintos, conservando las guardas URL/env antes de importar DB y los demás controles. No modifica servicios, permisos, SQL ni configuración. Backend y QA revisaron el delta final sin P1/P2;43casos preparados, replay nuevo pendiente.
