# Recuperación cerrada de una ficha sintética

## Hallazgos y alcance

Este incremento de G7 prueba una recuperación real en PostgreSQL desechable de GitHub, sin publicar un importador. El helper bajo tests crea y posee dos organizaciones, una identidad Auth compartida y una persona/gimnasta sin familia, grupos, inscripciones ni operaciones financieras. No admite archivos, IDs, SQL, credenciales o destinos elegidos por un consumidor. Solo selecciona variantes fijas de datos sintéticos.

La guarda exige GitHub/Linux, flag de integración y URL loopback exacta antes de importar la base; revalida después. Comprueba el login y sus privilegios, parejas completas de roles, base postgres, transporte local y replicación origin. Acepta TCP con puerto exacto o el backend Unix del stack nativo que ya verifica el runner; nunca nulos parciales. No cambia roles, permisos, TLS ni credenciales alojados. Los rechazos de sesión exponen únicamente ocho booleanos fijos.

El trigger de organización crea un bootstrap Free y su historial inmutable. La fixture permite exclusivamente esas dos fuentes excluidas, con conteos y estado Free/bootstrap/revisión 1, referencias y fechas exactas y sin trial/suscripción. Las conserva íntegramente en los snapshots. Los demás datos fuera del alcance permanecen rechazados.

## Fuentes y comprobaciones

- tests/helpers/canonical-athlete-recovery-rehearsal.ts: export real sin alterar ni resellar; proyección fija de persona/gimnasta; comparación con originales SQL; pérdida de esas dos filas y recuperación transaccional. Cleanup solo cierra el handle, sin SQL; el runner tiene asignada la destrucción del cluster completo.
- tests/canonical-athlete-recovery-pg.test.ts: 43 casos preparados. Guardas negativas, datos poblados y nulos, IDs ocupados en ambas academias, replay sin duplicados, rollback después de confirmar el primer INSERT y snapshots de Auth/todas las tablas canónicas. Un observador compara todas las filas antes/después de dos cierres del handle.
- scripts/ci/verify-sandbox-schema-replay.sh ejecuta la suite en PostgreSQL efímero sin retirar comprobaciones existentes; vitest.config.ts la excluye cuando no está seleccionado ese destino. Pins de runner/manifest actualizados; SQL baseline intacto.

El failpoint es una excepción controlada del helper después de un INSERT real confirmado. Prueba rollback transaccional, no una carrera de importadores de producto.

## Precisión: hipótesis corregida

La revisión inicial supuso que el export perdería microsegundos por la conversión Date/JSON habitual de node-postgres. El recorrido real usa tx.execute y result.rows: en c50440f5, la comparación con SQL fue exacta. Por tanto, aquella pérdida era una hipótesis, no un defecto demostrado de este exportador.

El caso actual no fuerza truncamiento. Comprueba antes de perder filas que los cuatro timestamps originales almacenan realmente una fracción submilisegundo de 456 y que las diferencias entre SQL y archivo son cero. Después exige pérdida exacta, recuperación de todos los valores mediante el archivo intacto, snapshot completo idéntico y replay rechazado sin mutaciones. Las variantes alineadas a milisegundos comprueban residuos cero. Se mantiene la guarda de fidelidad ante cualquier diferencia; no se presenta su negativo como ejecutado.

## Resultados previos y límites

- 3827cae6, replay 42107177373: nueve positivos rechazados antes de la fixture por un contrato de sesión no coincidente; 18 negativos PASS. No identifica por sí solo qué campo falló.
- 08cab809, replay 42108041222: nueve rechazos y 31 PASS; seis controles de sesión válidos y transporte/puerto rechazados.
- b6a27394, replay 42109157056: la guarda pasó; 34 PASS y nueve fallos registrados en cleanup DELETEorg, correctamente rechazado por historial append-only. Ese cleanup ocultó el error anterior. La fuente exigía cero filas excluidas pese al bootstrap automático.
- c50440f5, replay 42110400374: 42 PASS y un fallo en la expectativa de pérdida de microsegundos. Recuperación ms/nulos, conflictos/replay, rollback y cierre sin mutaciones pasaron; la recuperación µs completa todavía no estaba comprobada.

El siguiente resultado exacto se registra en la auditoría externa sin heredar PASS. La prueba solo acredita sus fixtures y esos escenarios: no devolución o recuperación integral, archivos externos, Auth/Storage/legacy, borrado/conservación, copias reales, permisos productivos ni RPO/RTO. El preflight general sigue blocked y restorable=false. No modifica el exportador ni convierte su paquete parcial en backup integral.

## Importancia y siguiente paso

Backend y QA revisaron estáticamente el delta final sin nuevos P1/P2. Los 43 casos del candidato actual quedan pendientes de replay y de CI completa. Nada se ejecuta en Mac. La preview sirve 63c64487 con invitaciones desactivadas. Sin SQL alojado, producción, Live, ensayo natural, proveedores o nuevos accesos. La publicación de otro SHA requiere revisión externa exacta.
