# Comprobación interna de recuperación canónica

## Hallazgos y alcance

Esta entrega añade un diagnóstico puro sobre el archivo parcial existente. Valida primero su forma, ámbito y checksums. Una política explícita de las46tablas identifica relaciones proyectadas ausentes, claves primarias y únicas conflictivas, columnas omitidas y referencias que necesitan resolución. Un segundo archivo solo representa un destino declarado de la misma organización; no acredita su estado real.

La salida es determinista y contiene nombres de tabla/regla, cantidades y hasta cinco ordinales de muestra; no devuelve filas, UUID, valores personales ni credenciales. Siempre mantiene `status: blocked`, `restorable: false` y autenticidad, autorización, destino, integridad referencial completa y completitud sin verificar. No contiene importador, ruta, conexión, reloj de ejecución, generación de IDs ni reactivación de comandos. No completa la devolución integral.

## Fuentes y regresiones preparadas

- Contrato y política: `canonical-recovery-contract.ts` y `canonical-recovery-policy.ts`. El cambio de proyección sin revisión explícita impide el diagnóstico.
- Aplicación: `preflight-canonical-academy-recovery.ts`, sin escritura ni llamadas externas. Compara UUID sin distinguir mayúsculas y tiempos preservando microsegundos. Aplica únicamente FK/unique proyectables y sus predicados; no sustituye PostgreSQL.
- Unitarias: paquetes sintéticos generados por el exportador con mocks; negativos relacionales resellados y verificados para no confundir un hash inválido con una relación rota. Raíz, tenant, padres, tuplas financieras/mensuales, nulls, unique parciales, destino conflictivo y minimización.
- PostgreSQL desechable: el test existente consume exactamente el archivo de la ruta real, comprueba el informe y las colisiones con el mismo destino declarado, entre los snapshots originales. Conserva las guardas GitHub/Linux/loopback y las aserciones previas.

Las pruebas, tipos y builds nuevos están NO EJECUTADOS hasta observar CI remota exacta. No se ejecutan en Mac. La preview permanece en ed77aa50 con invitaciones apagadas; este diagnóstico no está conectado a la interfaz.

## Importancia y límites

Avanza G7 sin tocar datos alojados. No verifica CHECK, EXCLUDE, triggers, RLS/ACL, esquema efectivo, conflictos fuera de la organización, procedencia ni permiso actual. Auth, Storage, legacy, catálogos compartidos, claves idempotentes y referencias de proveedor omitidas necesitan resolución separada; no se reconstruyen ni sustituyen.

## Siguiente paso

Cerrar revisión independiente y CI remota del candidato exacto. Después diseñar y autorizar por separado un ensayo selectivo con destino sintético, sin efectos externos. SQL alojado, producción, Live, ensayo natural, nuevas credenciales y proveedores permanecen excluidos. No se anuncia recuperación disponible ni MVP completo.
