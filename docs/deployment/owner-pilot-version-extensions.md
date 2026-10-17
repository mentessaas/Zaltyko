# Versión y extensiones: suplemento fijo

Entrega original local sobre `5344e9d5`, sin SQL ejecutado por Backend. La revisión
y ejecución posterior de Main se documentan a continuación.

## Ejecución posterior Main — 15 de octubre, 10:51 UTC

Frontend98 GO estático y Main12/12 tests de ambos contratos PASS, ESLint0,
formato y hash SQL comprobados antes de ejecutar. Main ejecutó el SQL exacto
SHA256 `803f2c6b1437ff57b374945fd381291a634198332324fefce92334c87c457e66`
una vez por destino, Sandbox y producción, en `BEGIN READ ONLY`, timeout local10s
y `COMMIT`. Solo catálogos y versión numérica, sin filas de negocio/Auth/finanzas.
[Snapshot sanitizado](../qa/remote-version-extensions-2026-10-15.json).

Ambos endpoints devolvieron `server_version_num=170006` (17.6), pgcrypto1.3 en
extensions, y ausencia de ltree/btree_gist. No demuestra backports del proveedor,
aplicabilidad concreta de CVEs ni uso de cifrados afectados. Se requiere contrastar
el mantenimiento de seguridad con Supabase y la recuperación antes de decidir
actualización; no se cambió versión, extensión, datos, schema o configuración.
No autoriza copiar los escaneos de datos o helpers del proveedor bajo el permiso
actual. Los límites de cobertura siguientes permanecen vigentes.

`scripts/sql/owner-pilot-version-extensions.sql` devuelve una única fila con una
única columna JSON `version_extension_evidence`, evitando perder SELECT previos
en clientes que solo muestran el último resultado. No implementa conexión,
transacción ni executor; el operador establece READ ONLY y timeout de 10 s.

La salida contiene `server_version_num` entero del servidor de esa sesión y tres
entradas ordenadas de ltree/pgcrypto/btree_gist: existencia, extversion, validez del
formato y categoría cerrada de esquema (public/extensions/pg_catalog/OTHER_REDACTED).
Ausencia: existencia false y versión/validez/esquema NULL. Se permiten únicamente
versiones numéricas con puntos y hasta 64 caracteres; otros formatos se redactan
a NULL con `version_format_valid=false`, sin inferir ausencia. No aparecen cadenas
libres de namespace, build completo, identidad, entorno, comentarios o cuerpos.

La consulta lee solo pg_extension/pg_namespace y el setting builtin numérico.
Sin índices, filas de aplicación/Auth/finanzas, funciones de aplicación, SQL
dinámico, cambios de extensión, upgrade, reindex, exports o pruebas de descifrado.

Una versión observada acredita ese endpoint/sesión en ese instante, no todo un
deployment/pool ni la aplicabilidad de las vulnerabilidades. La presencia de una
extensión no prueba uso de funciones afectadas ni índices/datos afectados. La
ausencia de btree_gist antes de instalar no describe el estado posterior al DDL.

La nota oficial anuncia la actualización 17.6 a 17.11 y condiciones por uso:
https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
No se copian sus consultas de filas, helpers temporales o SQL dinámico. El valor
previo de get_project no sustituye esta evidencia SQL ni prueba parches efectivos.

La actualización comunicada por Main sobre roles/esquemas procede de consultas
separadas: no se ejecuta ni repite aquí. Sigue sin identificar el rol del pool de
aplicación ni acreditar aislamiento funcional, recuperación o readiness.

Las pruebas son estáticas de contrato, no parsing ni ejecución PostgreSQL.
Sin cambios compartidos/vault: entrega local para revisión y consolidación Main.
