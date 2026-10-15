# Preflight de catálogo Owner: alcance y propuesta de uso

2026-10-15. Archivo: `scripts/sql/owner-pilot-catalog-preflight.sql`.
Propuesta local para Main, no ejecutada contra una base de datos.

## Qué permite observar

Diez SELECT independientes sobre catálogos PostgreSQL. Inventarían namespaces,
relaciones y RLS, columnas, forma de constraints/índices/policies, permisos de
tabla, funciones y extensiones requeridas. Incluyen capacidades del rol efectivo
y presencia de esquemas conocidos en el path resuelto, sin devolver identidad ni
el texto de `search_path`. No prueban que el path configurado sea literalmente
`public` ni distinguen un `$user` sin resolver.

Las relaciones inspeccionadas se restringen a `public`, `auth`, `zaltyko` y
`zaltyko_domain_private`. Solo se observa existencia/permisos del namespace
legacy `zaltyko_private`; no sus objetos. Los nombres de esquema/relación/columna/
rutina y tipo son identificadores estructurales; no hay nombres de cuentas,
propietarios o roles personalizados en la salida. Si existe sospecha de PII en
identificadores personalizados, revisar la salida en canal privado antes de
compartirla: la forma del catálogo no puede garantizar cómo fueron nombrados.

Las categorías ACL son fijas: PUBLIC, anon, authenticated, service_role y
OTHER_REDACTED. La categoría restante agrupa identidades distintas y no sirve
para compararlas entre proyectos. No se devuelven otorgantes, contraseñas,
valores de entorno, configuración de roles/funciones, comentarios, defaults,
expresiones, cuerpos SQL ni hashes de esos contenidos.

Las consultas de inventario tienen límite y `total_rows` anterior al límite.
Si supera el máximo, el resultado es INCOMPLETO: no concluir ausencia/paridad.
En ACL, `total_rows` cuenta entradas antes de deduplicar categorías redactadas;
es una cota conservadora. No interpretar ese número como total de grants únicos.

## Condiciones para una futura ejecución por Main

- Confirmar destino, permisos de inspección y transacción READ ONLY antes de
  enviar los SELECT; configurar timeout fuera del archivo. Este paquete no abre
  conexiones ni establece la transacción por su cuenta.
- Ejecutar el archivo exacto revisado; no sustituirlo por dumps o SELECT *.
- Conservar únicamente esta salida estructural en el canal aprobado.
- Si el rol no permite inventario suficiente, marcar NO VERIFICADO; no ampliar
  grants para obtener un resultado aparentemente completo.

No se incluyen filas de `auth`, negocio ni ledger. Versiones/checksums aplicados
son valores de tablas de historial, no catálogos builtin: requieren un alcance
de lectura distinto, explícitamente confirmado. Aquí solo puede observarse la
estructura/existencia de ledgers presentes en los esquemas inventariados. El
historial nativo de Supabase queda fuera de estos esquemas. No se incluye consulta
opcional ni dinámica que lea sus registros.

## Límites de la comparación

La forma de constraints, índices y policies no demuestra su semántica. Se omiten
checks, predicados y expresiones USING/WITH CHECK. Los OID de tipos/argumentos y
posiciones de columna son referencias locales; no compararlos como identidades
globales entre bases. No se inspeccionan triggers, secuencias, privilegios de
columnas/rutinas ni privilegios futuros. Los grants mostrados no sustituyen una
prueba de acceso efectivo bajo cada actor. No usar la salida como readiness ni
como permiso para instalar, reconciliar historial o activar rutas.

## Backup: evidencia que requiere operador/proveedor

El catálogo no acredita que exista una copia recuperable. Solicitar evidencia
redactada del proyecto origen, ID/fecha de backup o punto recuperable, estado,
retención/cobertura y ensayo de restauración con resultado y duración. El plan
comercial, disponibilidad PITR y coste de destino de ensayo requieren información
del proveedor vigente; no se deducen de SQL ni se han verificado aquí.

No descargar/exportar PII para este preflight. Un backup de solo esquema o un
ensayo sintético no demuestra recuperación de datos reales. Una restauración
gestionada en destino aislado puede evitar exportación al equipo, pero reproduce
datos personales allí y exige alcance y acceso aprobados. Conservar solo estado,
tiempos y resultados estructurales autorizados; no filas ni dumps en el informe.

## Validación local

17 tests estáticos PASS y ESLint focal PASS. Los tests revisan el contrato del
archivo y casos prohibidos, no ejecutan un parser/servidor PostgreSQL ni prueban
compatibilidad de versión o permisos del destino. No se ejecutó el archivo SQL,
no se abrió ninguna conexión y no se añadieron dependencias.

Vault: no modificada por la instrucción de evitar notas compartidas.
