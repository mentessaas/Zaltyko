# Evidencia mínima de roles antes de DDL

Base de revisión: `5344e9d5`. Entrega original local; ejecución posterior de Main
solo en Sandbox documentada abajo. Sin DDL ni acceso a filas de negocio.

## Camino de conexión comprobado en código

- `src/db/index.ts` construye `pg.Pool` con `getDatabaseUrl()` y Drizzle, de forma
  lazy; bloquea acceso durante las fases build de Next.
- `src/lib/env.ts:217`: en producción selecciona `DATABASE_URL_POOL` o
  `DATABASE_URL`; `DATABASE_URL_DIRECT` no es fallback productivo. No inspeccionar
  ni imprimir sus valores para este diagnóstico.
- `src/db/pool-config.ts` configura TLS, tamaño y timeouts; no establece un rol
  SQL propio. Bootstrap, ledger y monthly-invoice-service importan `@/db`.
- Las rutas verifican usuario y los servicios organización/rol/sede. En esos
  caminos revisados no se observó SET ROLE ni claims JWT por transacción. El rol
  humano Owner no identifica el usuario PostgreSQL del pool.

La identidad efectiva de la conexión desplegada, sus atributos y grants siguen
NO VERIFICADOS. La sesión MCP observada con BYPASSRLS no identifica ese pool.
La clave Supabase service_role usada por otros clientes tampoco prueba que
Drizzle conecte como service_role. El código fuente no revela qué credencial está
configurada en un deployment concreto.

## Evidencia existente y suplemento

`owner-pilot-catalog-preflight.sql` ya inventaría RLS, policies sin expresiones,
ACL directas y permisos del rol inspector; no duplicar ese inventario. Su consulta
2 devuelve capacidades de la sesión ejecutora, no nombres. Reutilizar esa lectura
desde la conexión real de aplicación sería evidencia nueva de procedencia, sin
necesitar otra consulta de identidad. Un resultado MCP no sirve como sustituto.

El suplemento `scripts/sql/owner-pilot-fixed-role-privileges.sql` añade únicamente
la brecha de privilegios efectivos de anon/authenticated/service_role, contando
herencia aplicable y PUBLIC, y detección de privilegios por columna. Devuelve
3 filas de atributos de roles, 6 de esquemas y 24 del subconjunto fijo de tablas.
Solo etiquetas técnicas fijas y booleanos; ausencia implica NULL en privilegios,
no false. No muestra nombres libres, otorgantes, owners, miembros de roles,
expresiones ni filas de las tablas nombradas en VALUES.

La matriz no incluye el rol personalizado de aplicación si existe. Los checks
de tabla y esquema deben interpretarse juntos. SELECT permitido no demuestra
que RLS permita filas; permiso denegado de tabla no descarta grants de columnas.
BYPASSRLS/superuser y ownership deben evaluarse con FORCE RLS. Se distingue owner
exacto de privilegios del owner heredados mediante pg_has_role(..., 'USAGE'), sin
devolver identidades ni cadenas de membresía. No se ejecutan
funciones de aplicación ni se inspeccionan claims o cuerpos de policies.

## Siguiente evidencia mínima, sujeta a revisión separada

1. Confirmar procedencia de una sesión abierta por la misma configuración/pool
   del deployment candidato, sin registrar credenciales, URL ni identidad libre.
   Usar la consulta 2 existente para capacidades efectivas/session-role y una
   comparación booleana contra el rol esperado acordado, si se necesita probar
   identidad exacta: todavía no se conoce ese rol y no se inventa aquí.
2. Revisar este suplemento antes de cualquier ejecución, en destino explícito,
   transacción READ ONLY y timeout de 10 s establecidos por el operador fuera del
   archivo. No aporta ejecutor, permisos nuevos ni autorización de DDL.
3. Si faltan tablas en producción antes de instalar, la matriz solo probará su
   ausencia. Los grants futuros dependen del rol creador/default ACL y del SQL
   instalado; se requiere revisión previa y revalidación posterior. No inferir
   permisos futuros de los actuales ni paridad de esquema del ledger.

No cubre EXECUTE de rutinas, secuencias, default ACL, acceso por views/rutinas,
semántica completa de policies ni aislamiento funcional. Para grants directos y
policies usar el preflight existente; para accesos reales se necesitará validación
autorizada aparte. No declara readiness, backup recuperable ni activación segura.
No introduce flags ni vuelve a solicitar evidencia humana pendiente.

Pruebas de la entrega exclusivamente estáticas: contrato de fuentes, salida acotada, roles
fijos, privilegios y ausencia de SQL dinámico/escrituras. No prueban parsing o
ejecución PostgreSQL. Vault sin modificar por tratarse de entrega aislada a Main.

## Ejecución posterior Main — 15 de octubre, evidencia reunida a las 10:37 UTC

Backend `dcdb4b32`, revisión estática Frontend94 GO y Main 5/5 tests PASS antes
de ejecutar. SQL SHA256
`8f65846bb606769826837921575ebf5b7a994419b9149c182d2f56ec5e812ffd`,
sin cambios, en Sandbox `aeeootdmuiqkfeernskw`, con `BEGIN READ ONLY`,
`SET LOCAL statement_timeout = '10s'` y `COMMIT` externos. La primera llamada
ejecutó los tres SELECT pero MCP devolvió solo el último: se obtuvieron roles y
esquemas mediante sus SELECT individuales, sin repetir relaciones. Resultado
sanitizado: [snapshot](../qa/sandbox-fixed-role-privileges-2026-10-15.json).

- Los tres roles existen, no son superuser; solo `service_role` tiene BYPASSRLS.
- `anon` no tiene USAGE/CREATE sobre ambos esquemas; authenticated/service_role
  tienen USAGE, no CREATE. No son la identidad verificada del pool de aplicación.
- En cinco tablas de negocio presentes, RLS está habilitado y forzado. Anon no
  tiene privilegios comprobados; authenticated solo SELECT de organizations;
  service_role tiene los siete privilegios de tabla y los tres any-column.
- Base ledger presente, sin RLS y sin privilegios comprobados para esos roles;
  delta ledger e invoice_line_enrollments ausentes, privilegios NULL, no denegación.
  Ninguno de los roles posee ni hereda privilegios del owner en objetos presentes.

Esto verifica ejecución de la consulta en PostgreSQL, no RLS funcional, exposición
Data API, identidad/privilegios del pool, migraciones futuras ni readiness. No se
consultó producción en esta pasada. `has_any_column_privilege` incluye permisos de
tabla completa; no demuestra un grant exclusivamente por columna. No incluye
REFERENCES por columna. Semántica de las funciones y `pg_has_role(...,'USAGE')`:
[PostgreSQL17, funciones de información](https://www.postgresql.org/docs/17/functions-info.html).

## Mantenimiento del proveedor pendiente de contraste

El [aviso oficial Supabase17.11/15.19](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
anuncia correcciones de seguridad y condiciones de compatibilidad de actualización.
El dato anterior PG17.6 no determina versión actual, backports ni aplicabilidad de
CVEs a este proyecto. Contrastar versión/catálogos y recuperación antes de un plan
de mantenimiento; no ejecutar SQL de detección del proveedor que lea filas, cree
funciones o SQL dinámico bajo este permiso metadata-only. No se autoriza ni ejecuta
upgrade, reindex, cifrado, restauración ni DDL desde este informe.
