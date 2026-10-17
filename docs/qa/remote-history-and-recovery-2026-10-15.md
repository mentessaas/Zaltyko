# Historial técnico y recuperación: comprobación de solo lectura

15 octubre 2026. No es autorización de DDL ni de publicación. No se leyeron filas de negocio, Auth ni ledger financiero; sí metadata del historial técnico de despliegues, diferenciada del catálogo estructural previo.

## Hallazgos verificados

1. Supabase `list_migrations`:53 entradas nativas en producción y70 en Sandbox. Ninguna coincide con las18 versiones aprobadas. La herramienta devuelve version/name, no checksums; nombres/versiones ajenos no se conservaron en la evidencia. Esto NO prueba que esos SQL nunca se ejecutaron: el runner usa un ledger técnico independiente. [Snapshot saneado](./remote-deployment-history-2026-10-15.json).
2. Catálogo en transacción READ ONLY y statement_timeout10s: producción no tiene los dos ledgers privados esperados; Sandbox sí tiene `e2e_schema_migrations` con filename/version/checksum/applied_at y no tiene `e2e_delta_schema_migrations`. No se devolvieron fechas ni valores de ese historial.
3. Backend76 revisó el SQL de comparación exacto, SHA256 `5f9932cfb8621771306c164d9875297d2e2278cec3465752d39a72bb57ff9061`. Main lo ejecutó SOLO en Sandbox, READ ONLY10s. Las16 migraciones base tienen exactamente una fila, versión y checksum coincidentes; las dos finales no están registradas y no hay filas extra. [Comparación](./sandbox-deployment-ledger-comparison-2026-10-15.json), [SQL fijo](../../scripts/sql/owner-pilot-ledger-reconciliation.sql). Dos regresiones estáticas PASS comprueban tuplas y forma de salida; no son un parser SQL ni prueban semántica de esquema.
4. ACL de catálogo Sandbox: anon no tiene USAGE de `zaltyko_domain_private`; authenticated sí. Ninguno tiene SELECT del ledger base; RLS de ese ledger técnico privado está desactivada. Esto no demuestra exposición Data API ni valida el rol de aplicación; no se cambiaron grants ni RLS.
5. Ambos proyectos ACTIVE_HEALTHY en eu-north-1. Versiones reportadas: producción17.6.1.038; Sandbox17.6.1.147. Salud/versión no prueban backup ni instalación contractual.

## Recuperación pendiente, sin exportar ni restaurar

La conexión MCP disponible no ofrece listado de backups y `get_project` no incluye estado/fecha de copias. No se llamó a restore ni se intentó obtener credenciales por otra vía. La skill `codex-in-app-browser` remite a un SKILL.md obligatorio ausente en el paquete instalado: no se inicia un control alternativo del navegador.

La [documentación oficial de backups](https://supabase.com/docs/guides/platform/backups) distingue disponibilidad por plan y advierte que los objetos Storage no se incluyen. Ofrece consulta de metadata mediante Management API, pero no se obtuvo ni solicitó un token en texto plano. No inferir plan, copia disponible o restaurabilidad por esa documentación.

Siguiente evidencia humana mínima: abrir Database → Backups de ambos proyectos y comunicar disponibilidad/fecha y si figura PITR, sin pulsar Restore, descargar datos o contratar nada. Una captura sin secretos sirve para disponibilidad; no demuestra ensayo de recuperación. Cualquier propuesta posterior de backup/exportación/ensayo requiere alcance, almacenamiento seguro, impacto, coste y aprobación específicos. No habilitar servicios de pago para eludir este gate.

## Interpretación y siguiente paso

El historial base de Sandbox está conciliado respecto al manifiesto; el esquema completo y la recuperación NO. Producción continúa requiriendo planificación de instalación del dominio completo sin asumir que no contiene datos legacy. Backend prepara contrato de aplicación futura (solo documento); no hay ejecutor nuevo. Gates independientes: CI exactSHA, seguridad residual, esquema/rol app/recuperación, aprobación PR y publicación.

Frontend76GO para commit local del paquete; no push durante CI. La comparación no reconstruye orden histórico de ejecución: la secuencia devuelta es la esperada del manifiesto, no una prueba del orden aplicado. READ ONLY y timeout corresponden al wrapper externo utilizado por Main, no a un ejecutor entregado por el archivo SQL.
