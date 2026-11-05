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
