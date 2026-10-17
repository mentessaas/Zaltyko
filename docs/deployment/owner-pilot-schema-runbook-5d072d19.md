# Piloto Owner: instalación de esquema, activación y recuperación

Fecha: 2026-10-15. Estado: propuesta local para revisión; no ejecutada.
Candidato de origen: `5d072d1902a8f735eae7c0ad6ef367adf09656dc`.

## Alcance y evidencia

Este paquete entrega un manifiesto de 18 archivos SQL con SHA-256 de sus bytes
exactos en el candidato, un checker estático y este procedimiento. No entrega
un ejecutor de aplicación ni cambia SQL, rutas, permisos o datos remotos.
Un resultado estático PASS y una inspección de metadatos no acreditan readiness,
backup restaurable, aislamiento efectivo, E2E autenticado ni activación segura.

Referencia histórica del checkout backend `6ed06ad4`: las primeras 16 migraciones
coincidían byte a byte con el candidato y los SQL 17/18 estaban ausentes. El
paquete `db448d7c` incorporó `scripts/lib/e2e-domain-migrations.ts` idéntica a la
del candidato para reutilizar sus listas, sin modificar el runner sandbox ni
copiar esos dos SQL. El bloqueo del checker correspondía a ese worktree. No
extrapolarlo a integración: Main confirmó allí los 18 archivos del manifiesto.

### Evidencia posterior comunicada por Main — 2026-10-15

Fuente de catálogo en integración: `509f3597`,
`docs/qa/remote-schema-catalog-2026-10-15.json` y
`docs/qa/remote-schema-metadata-2026-10-15.md`. Sustituye la incertidumbre inicial
sobre namespaces: producción no tiene `zaltyko` ni `zaltyko_domain_private`;
mantiene el helper legacy `zaltyko_private`. Sandbox sí tiene los namespaces
nuevos, pero carece de las cinco tablas de los deltas 17/18 y de
`invoice_lines.location_id/athlete_id`. Ambos destinos carecen de `btree_gist`.

Main comunicó además reconciliación técnica READ ONLY, timeout 10 s, solo Sandbox:
16/16 entradas base con una fila y versión/checksum exactos; 17/18 ausentes y
cero filas ajenas al manifiesto. El ledger delta está ausente según catálogo.
Esto verifica los registros del ledger base respecto al candidato; no demuestra
equivalencia semántica de objetos, procedencia de filas ni ACL del ledger. Main
adjunta el resultado en
[`sandbox-deployment-ledger-comparison-2026-10-15.json`](../qa/sandbox-deployment-ledger-comparison-2026-10-15.json)
y el alcance en
[`remote-history-and-recovery-2026-10-15.md`](../qa/remote-history-and-recovery-2026-10-15.md).
La observación de ACL posterior no reemplaza la comprobación del rol de aplicación.

El historial nativo independiente registra 53 entradas en producción y 70 en
Sandbox, ninguna de las 18 versiones esperadas. Solo aportó versión/nombre, no
checksums: no invalida el ledger E2E ni prueba que sus migraciones no se ejecutaran.
El rol/path observados mediante MCP no describen la conexión de aplicación.
Este agente no realizó consultas remotas para actualizar el documento.

## Comprobación estática local

Desde la raíz del checkout, sin cargar `.env` ni abrir conexiones:

```sh
pnpm exec tsx scripts/check-production-schema-manifest.ts
pnpm exec tsx scripts/check-production-schema-manifest.ts --source=candidate
pnpm exec vitest run tests/production-schema-manifest.test.ts
```

El primer comando comprueba exclusivamente archivos del worktree y sale con 1
si falta o difiere cualquiera. El segundo lee objetos Git locales mediante
`git show` del SHA completo fijado; no hace fetch, checkout ni reset. Su PASS
solo acredita los archivos de ese candidato, no los del worktree. Si falta el
objeto local, bloquea sin descargarlo. Nunca se usa Git como fallback implícito.

Ambos validan forma estricta, candidato, conjunto exacto, secuencia y hashes.
Rechazan orden cronológico, duplicados, archivos extra/ausentes, cambios de bytes
y argumentos como `--apply` o `--connect`. Todos los reportes incluyen
`mode: static-only`, `schemaReadiness: NOT_VERIFIED` y `activationAllowed: false`.
El checker no consulta catálogo, historial aplicado ni filas de negocio; no
evalúa el contenido semántico del SQL ni genera sentencias para ejecutarlo.

## Manifiesto y dependencias

La fuente de nombres y SHA-256 es
`production-schema-manifest-5d072d19.json`. La composición revisada es la lista
base de 16, seguida del delta de consentimiento y el delta de tarifa mensual.
Las dos listas locales siguen separadas de la allowlist sandbox. No usar el
runner sandbox contra producción ni saltarse su verificación de destino.

Orden obligatorio (nunca ordenar por timestamp):

| Paso | Versión        | Objeto principal / dependencia                         |
| ---- | -------------- | ------------------------------------------------------ |
| 1    | 20261006080702 | Fundación, esquemas, identidad, operaciones y helpers  |
| 2    | 20261013100000 | Perfiles deportivos; exige `programs` vacía            |
| 3    | 20261006085254 | Invariantes de matrículas                              |
| 4    | 20261006090034 | Familias, responsables y pagadores                     |
| 5    | 20261006093047 | Ledger interno, facturas, cargos y pagos               |
| 6    | 20261006094607 | Motor de métricas                                      |
| 7    | 20261006100146 | Health Score                                           |
| 8    | 20261006113000 | Insights                                               |
| 9    | 20261006123000 | Comandos idempotentes de bootstrap                     |
| 10   | 20261006131000 | Moneda por defecto de organización                     |
| 11   | 20261006160012 | Índice de frescura de pipeline                         |
| 12   | 20261006165917 | Proyecciones de retención                              |
| 13   | 20261013120000 | Preferencias del dashboard                             |
| 14   | 20261013082806 | Cuentas de proveedor de pago                           |
| 15   | 20261013160000 | Cobro familiar y entitlements                          |
| 16   | 20261013170001 | Historial de pertenencia a grupos                      |
| 17   | 20261013235142 | Consentimiento Owner canónico                          |
| 18   | 20261014001209 | Cobertura de tarifa e instantáneas de líneas mensuales |

No hacer bootstrap entre pasos: el paso 2 elimina la clasificación antigua de
`programs`, añade la nueva y aborta si hay filas. El paso 18 depende del ledger,
añade claves compuestas, una exclusión GiST e instantáneas inmutables.

No hay DDL/escrituras explícitas sobre tablas `public` o `auth` en estos 18
archivos. Sí hay FKs a `auth.users` y políticas que llaman a `auth.uid()`.
La fundación crea `zaltyko` y `zaltyko_domain_private`, mantiene separado el
helper legacy `zaltyko_private`, revoca/concede permisos y configura privilegios
por defecto para el rol que crea objetos. Deben comprobarse también el rol real
de la aplicación y sus permisos: RLS activada no prueba aislamiento cuando el
acceso servidor usa un rol con BYPASSRLS.

El paso 18 crea `btree_gist` si no existe, sin especificar esquema. Verificar
antes versión, esquema de instalación, privilegios del ejecutor y efectos sobre
objetos de extensión potencialmente fuera de `zaltyko`. Los archivos usan
`gen_random_uuid()` y no instalan `pgcrypto`; verificar su resolución en destino.
No desinstalar una extensión compartida como parte del rollback del piloto.

## Contrato propuesto del futuro apply por destino

Diseño pendiente de implementación y revisión. Ninguno de los comandos estáticos
anteriores admite apply. La elección de destino/alcance debe ser explícita, sin
un modo genérico que descubra todo el directorio o permita un `--only` arbitrario.

| Perfil futuro                   | Destino fijado         | Precondición histórica                                                        | Migraciones permitidas               |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| Deltas Sandbox                  | `aeeootdmuiqkfeernskw` | Base 16 exacta, sin extras/duplicados, catálogo base compatible               | Pasos 17 y 18 en ese orden           |
| Instalación completa producción | `jegxfahsvugilbthbked` | Namespaces nuevos ausentes y sin registros contradictorios de estas versiones | Pasos 1 a 18 en orden del manifiesto |

Para Sandbox, no volver a ejecutar ni cambiar los registros base. El ledger de
los deltas será `zaltyko_domain_private.e2e_delta_schema_migrations`, nombre ya
usado por el preflight del candidato. Para producción, proponer un ledger propio
`zaltyko_domain_private.production_schema_migrations`, separado de los historiales
E2E, `public` y Supabase. La creación y ACL del ledger son DDL de infraestructura
que debe estar incluido expresamente en el plan aprobado, no un efecto oculto.
No rellenar retrospectivamente el historial nativo ni registrar versiones ficticias.

La ausencia de namespaces en producción es una precondición del inicio vacío,
no de una reanudación: tras confirmar pasos, solo se admite el prefijo exacto
registrado y su catálogo compatible. Un namespace creado sin ese historial
aprobado bloquea; no se adopta ni se borra para simular una instalación nueva.

Requisitos de ambos perfiles:

1. Dry-run por defecto. Fijar ref de destino, candidato, hash del manifiesto,
   secuencia pendiente, snapshot de precondiciones y referencia de recuperación.
   Resolver conexiones/rol del operador sin imprimir credenciales.
2. Antes de cualquier escritura, repetir comprobación de artefactos, catálogo e
   historial bajo exclusión mutua. Si cambia el plan revisado, detenerse. La
   aprobación no permite adoptar objetos inesperados o reparar hashes.
3. Cada paso y su registro real de archivo/hash se confirman juntos en una
   transacción. Un fallo revierte ese paso y detiene el lote. Registrar ordinal
   del manifiesto; el timestamp del nombre no define el orden de ejecución.
4. Reanudar únicamente un prefijo verificado del ledger del perfil: duplicados,
   huecos, hashes distintos, objetos sin registro o registros sin objetos bloquean.
   En Sandbox debe verificarse de nuevo la base 16 antes de cualquier delta.
5. No instalar el delta 18 sobre objetos parciales ni retirar `btree_gist` al
   revertir la aplicación. Revisar su esquema/versión antes de autorizar creación.
6. Emitir solo estado, archivo esperado, hash local, tiempos y conteos técnicos
   aprobados; no copiar filas devueltas por las migraciones. El éxito de instalación
   no activa bootstrap, rutas o workers ni acredita readiness del piloto.

### Bloqueos independientes

- **Recuperación:** backup/punto recuperable y ensayo pertinente con resultado y
  duración frente a RPO/RTO acordados. La disponibilidad declarada por proveedor
  y los checksums del ledger no prueban restaurabilidad. No exportar PII para
  comprobarlo ni crear destinos/costes sin alcance aprobado. Aplica también a
  Sandbox: su nombre no demuestra que todos sus datos sean sintéticos.
- **Rol de aplicación:** verificar conexión efectiva, privilegios mínimos y acceso
  por organización/sede. BYPASSRLS del MCP no resuelve este requisito. Las rutas
  usan DB servidor y nombres calificados; no necesitan exponer `zaltyko` en Data API.
- **Activación:** gate servidor por participantes, cierre de escritores/consumidores
  y release compatible. Instalar esquema y habilitar usuarios son pasos separados.
- **Ejecución:** implementador/revisor, plan exacto y autorización de la ventana
  todavía pendientes; esta propuesta no concede permiso de DDL para ningún destino.

## Fase A: instalar sin activar rutas

1. Fijar artefacto, commit, manifiesto y hashes. Revisar cualquier diferencia
   sin modificar históricos aplicados ni inventar filas de ledger. La advertencia
   histórica de checksum del ledger exige conciliación con el destino real.
2. Comprobar por catálogo namespaces, tipos, tablas, columnas, restricciones,
   índices, funciones, triggers, grants y RLS. Si aparece un objeto greenfield
   sin procedencia reconciliada, detenerse: no asumir que es una instalación nueva.
3. Preparar un ejecutor revisado y aprobado para este manifiesto exacto. Es trabajo
   pendiente: este paquete no lo implementa. Debe registrar archivo/hash y SQL en
   la misma transacción, usar exclusión mutua, conservar el orden explícito y
   reanudar solo prefijos registrados. No usar push ni aplicar todo el historial.
4. Obtener backup restaurable y ensayar recuperación en destino separado. Registrar
   alcance, momento de recuperación, duración, responsable y condiciones de corte.
   No volcar filas/credenciales en logs, commits o este runbook.
5. Mantener cerrados bootstrap, endpoints y workers del piloto. Preparar un gate
   servidor por participantes y un cierre operativo de escrituras. No hay un gate
   nuevo implementado por esta entrega; ocultar enlaces no bloquea endpoints.
6. En la futura ventana autorizada, ejecutar solo el perfil aprobado: dos deltas
   en Sandbox o instalación completa de 18 en producción. Registrar cada resultado.
   Un fallo detiene el lote y revierte la transacción de ese paso.
7. Revisar metadatos y hashes tras la instalación. Confirmar que no hubo cambios
   inesperados en tablas/políticas legacy, `auth` ni helpers privados anteriores.

“Esquema sin actividad” permite las filas de configuración que insertan las
migraciones: perfiles deportivos, métricas, versiones/pesos, reglas y política
de consentimiento. No crear organizaciones, familias, facturas o fixtures reales
durante la instalación. Los seeds E2E no forman parte del despliegue.

## Fase B: activar participantes

1. Validar sesión y consentimiento canónico en el candidato desplegado; la ruta
   de bootstrap registra consentimiento antes de crear la organización. Si falla
   el bootstrap, puede quedar el consentimiento registrado para un reintento.
2. Habilitar bootstrap solo para participantes. Crea organización, sede, miembro
   Owner, especialidades y programas con idempotencia, auditoría y outbox. El
   trigger del paso 15 crea entitlement Free e historial. No convierte una academia
   legacy automáticamente ni importa sus datos.
3. Validar un recorrido aprobado: familia y pagador, gimnasta, clases/matrículas,
   tarifa y cobertura de mes completo, cotización, emisión única y pago manual.
   Comprobar permisos/sede, reintentos e idempotencia en el candidato desplegado.
   Este documento no autoriza ni ejecuta esa actividad o un cobro real.
4. Habilitar consumidores del pipeline de forma controlada; observar fallos,
   backlog, auditoría y frescura. Las migraciones no generan por sí solas todos
   los snapshots/benchmarks necesarios para un dashboard con datos.
5. Ampliar participantes solo tras evidencia de operación, aislamiento y recuperación.
   Pagos manuales no equivalen a activar Stripe ni cobro automático.

El flujo mensual del candidato rechaza tarifas nuevas no positivas y marca una
asignación cero con `PRICE_PLAN_ZERO_AMOUNT`. La familia completa queda bloqueada
antes de crear cargos, incluso con otras líneas positivas. Las familias con
tarifas positivas válidas pueden emitir. Cuotas gratuitas/becas cero requieren
decisión específica; la discrepancia permisiva del ledger genérico no debe
tratarse como soporte de gratuidad del flujo mensual.

## Recuperación que conserva actividad nueva

| Momento                                   | Acción segura                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Falla un paso de instalación              | Revertir ese paso; conservar prefijo confirmado y ledger; cerrar activación y diagnosticar antes de reanudar.                                                                  |
| Esquema instalado, aplicación defectuosa  | Desactivar gate y escritores/consumidores del piloto; volver a una versión de aplicación compatible; conservar esquema y configuración.                                        |
| Ya existen altas, facturas o pagos nuevos | Cerrar escrituras afectadas; conservar datos y claves de idempotencia; corregir hacia delante con revisión; no repetir una operación financiera con clave nueva sin conciliar. |
| Recuperación excepcional desde backup     | Restaurar primero en otro destino y conciliar la actividad posterior; aprobar cualquier sustitución del destino con pérdida de datos explícitamente evaluada.                  |

No usar `DROP SCHEMA CASCADE`, eliminar organizaciones, borrar el ledger ni
restaurar globalmente producción sobre actividad reciente como rollback rutinario.
Eliminar una organización puede eliminar datos en cascada. Antes de arrancar
workers tras recuperación, conciliar eventos procesados para evitar duplicados.
Una corrección contable debe preservar auditoría e instantáneas inmutables.

## Pendientes y registro de revisión

Validación histórica del paquete de manifiesto `db448d7c`:

- Vitest focal: 1 archivo, 25 tests PASS (lectores inyectados con bytes sintéticos).
- Checker sobre candidato Git: PASS, 18 archivos comprobados.
- Checker sobre worktree backend: BLOCKED esperado, 16 archivos comprobados y
  dos `FILE_UNAVAILABLE`; no se sustituyeron por SQL de otra versión.
- Typecheck y ESLint focal: PASS. No se ejecutaron SQL, runners DB o consultas
  remotas; estas pruebas no acreditan instalación ni readiness.

- Ejecutor de producción, gate servidor y mecanismo de cierre de escrituras.
- Revalidar catálogo/semántica y adjuntar evidencia del historial base Sandbox ya
  reconciliado por Main; revisión de extensión, ACL de ledgers y rol de aplicación.
- Backup/restauración ensayados y corte aprobado; E2E/operación del candidato.
- Responsable de instalación: pendiente. Responsable de activación: pendiente.
- Evidencia estática: registrar fuente `worktree` o `candidate`, commit y salida;
  no etiquetar ninguna de ellas como readiness de producción.

Esta actualización modifica solo el runbook. No se implementó apply, no se
cambiaron SQL/manifiesto y no se repitieron tests/runners ni consultas remotas.

Vault: no modificada por instrucción expresa de evitar notas compartidas. Main
deberá trasladar decisiones y resultados reales a las notas canónicas al integrar.
