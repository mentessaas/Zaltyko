# Verificación de archivos canónicos y fechas civiles

## Problema y cambio

El exportador utiliza filas crudas de node-postgres. El parser predeterminado puede convertir `date` en Date, que al serializarse deja de representar una fecha civil YYYY-MM-DD. Ahora el catálogo detecta esas columnas y las proyecta como texto tanto en preflight como en lectura; DateStyle ISO se fija dentro del snapshot de solo lectura. Los timestamps mantienen el contrato ISO existente. No se modifican filas ni esquemas.

El verificador puro de un archivo parcial comprueba límites, estructura, catálogo/proyección, organización declarada en cada fila, orden y hashes autocontenidos. Los conteos excluidos se limitan al rango int8 antes de convertir texto a BigInt. Las fechas civiles se validan como calendario, separadas de timestamps. Se rechazan campos o tablas no clasificados y modificaciones aunque se rehaga un hash sin respetar el contrato.

El resultado no devuelve las filas y declara explícitamente: parcial, limitado, no restaurable, sin autenticidad ni autorización actual verificadas, sin integridad referencial o completitud de origen acreditadas. Un hash autocontenido no prueba procedencia. No existe un endpoint nuevo de importación, supresión o restauración por este cambio.

## Controles previstos

La suite sintética cubre ida y vuelta del productor/verificador, tipos int4/int8, Unicode, tenant, límites, alteraciones y las27 columnas DATE clasificadas. El caso positivo PostgreSQL existente pasa al verificador los bytes del GET real y exige YYYY-MM-DD para una fecha sintética; conserva hashes, aislamiento y snapshots sin escrituras. Solo se ejecutará en el PostgreSQL efímero de GitHub ya protegido por guardas de destino. No accede a bases alojadas ni cambia datos del ensayo.

Owner revisó independientemente el verificador, las regresiones sintéticas y el diff PostgreSQL congelado, sin P1/P2 estáticos pendientes. Falta la ejecución remota del SHA final antes de considerarlos comprobados. No hubo ejecución de suites, builds, tipos o instalaciones en el Mac. La exportación sigue siendo parcial: Auth, Storage, legacy, fuentes excluidas, supresión y recuperación selectiva conservan sus pendientes separados.
