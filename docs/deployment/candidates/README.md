# Candidatos SQL pendientes de autorización

Estos archivos están fuera de `supabase/migrations` deliberadamente. No forman
parte del historial aplicable, no se recorren automáticamente y no recuperan
migraciones perdidas. No ejecutar el directorio ni aplicar el snapshot sandbox
completo sobre una base existente.

## Candidato de instalación canónica

La CLI Supabase 2.84.2 creó el nombre
`20261025202902_canonical_domain_installation_candidate.sql` mediante
`supabase migration new canonical_domain_installation_candidate`. Se apartó
inmediatamente el archivo vacío a esta carpeta, antes de añadir cualquier SQL.
Su contenido se generó en CI a partir del AST y el snapshot fijados y se copió
sin edición desde el artefacto. No procede de recortes de texto del dump.
CI40232012970 comprobó la instalación y el rechazo de replay del archivo exacto.
SHA-256: `00ead5a3869bb335f2f17e58ebaaacac2bdc1ae4504493b473c68393359dab00`.
Ver `docs/qa/canonical-installation-candidate-proof-2026-10-25.md` para evidencia
y límites; sigue pendiente de revisión y autorización productiva separada.

El alcance propuesto es la extensión `btree_gist`1.7 y los dos namespaces
canónicos ausentes, con sus objetos, propietarios y permisos revisados. No
incluye filas, roles, Auth, ledger E2E ni alteraciones de public/legacy. La
normalización de defaults se limita al creador `postgres`: el rol productivo
no es superusuario ni miembro de `supabase_admin`, y no debe alterar defaults
de ese administrador.

El archivo candidato termina en COMMIT y requiere un modo externo explícito.
La CI solo permite `ci` con el nombre exacto de la base desechable; el modo
productivo propuesto queda bloqueado sin marcadores externos específicos. Esos
marcadores no prueban por sí solos la identidad de una conexión ni constituyen
autorización humana. No configurarlos ni ejecutar el modo productivo todavía.

## Candidato de solicitudes de prueba (P2 #15)

`20261110120000_admission_requests_candidate.sql` crea solo
`zaltyko.admission_links` (el enlace público que la academia activa,
desactiva o regenera, con un token de 128 bits) y `zaltyko.admission_requests`
(la solicitud que una familia deja desde ese enlace, antes de que exista la
ficha de la gimnasta). No toca tablas existentes, filas, roles ni objetos
legacy. Fuerza RLS, revoca `anon` y `authenticated`, y se niega a reinstalarse
si alguna de las dos relaciones ya existe.

- SHA-256: `cc3534438ca14a25086f33d14850ad361daf22891ec1d29f1f01e533643f62ea`.
- Prueba: `tests/admission-requests-pg.test.ts` (instala el candidato solo en
  PostgreSQL desechable de GitHub y borra las tablas al terminar). **No se
  ejecuta en ningún CI todavía:** no se ha añadido a
  `scripts/ci/verify-sandbox-schema-replay.sh`, porque ese script y
  `supabase/schema-snapshot-manifest.json` son un contrato protegido con sus
  hashes fijados. Queda pendiente de ejecutar en schema-replay cuando Elvis lo
  autorice, con la actualización de esa cadena de procedencia en una PR propia.
- Mientras no se aplique, `src/modules/admissions/application/admission-storage.ts`
  detecta que falta y el embudo responde «no disponible», sin errores a medias.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Contexto y corte mínimo: `docs/producto/embudo-captacion.md`.

## Candidato del panel de inteligencia competitiva (super-admin)

`20261110180000_competitive_intelligence_candidate.sql` crea ocho tablas
`public.ci_*` para el panel interno `/super-admin/competencia`: competidores,
secciones de la ficha con estado del dato, fuentes, flujos de producto y su
cobertura, planes de precios, oportunidades e historial de cambios. Solo guarda
información pública de empresas del mercado; ningún dato de academias,
familias ni menores. No toca tablas existentes, se niega a reinstalarse si
alguna relación ya existe, fuerza RLS y deniega cualquier acceso de clientes
`anon`/`authenticated`; el servidor accede con `withSuperAdmin`.

- Esquema Drizzle espejo: `src/db/schema/competitive-intelligence.ts`. **No se
  exporta desde `src/db/schema/index.ts`** a propósito: `drizzle.config.ts` lee
  ese índice y un `db:generate`/`push` crearía las tablas sin RLS ni `REVOKE`,
  expuestas por PostgREST. El código lo importa directamente.
- `tests/competencia-security-contract.test.ts` comprueba que este SQL crea las
  mismas tablas que el esquema, que todas tienen `ENABLE`/`FORCE ROW LEVEL
  SECURITY`, `REVOKE` a `public`/`anon`/`authenticated` y la política
  restrictiva, y que el esquema no llega a drizzle-kit (`validate-rls.ts` no
  cubre estas tablas porque no tienen tenant).
- Semilla idempotente: `src/content/competencia/semilla-2026-11.json`, que se
  carga con `pnpm db:seed:competencia` o con el botón «Cargar datos iniciales»
  del panel. Solo inserta lo que falta. El script solo acepta bases en loopback;
  una base alojada exige `-- --permitir-base-remota` además de la autorización.
- Mientras no se aplique, `src/lib/competencia/storage.ts`
  (`isCompetitiveIntelligenceAvailable`) detecta que faltan las tablas y el
  panel muestra «no disponible» sin errores a medias.
- **Requiere autorización de Elvis para aplicarse.** Solo se ha instalado en un
  PostgreSQL efímero local para comprobar el panel (10-11-2026); no se ha
  aplicado en sandbox ni en producción.

## Candidato de objetivos y observaciones por gimnasta (P2 #17)

`20261111120000_athlete_progress_candidate.sql` crea solo
`zaltyko.athlete_objectives` (objetivo con aparato GAF/GAM opcional, fecha
objetivo y estado), `zaltyko.athlete_objective_status_history` (una fila al
crear y otra por cada cambio de estado) y `zaltyko.athlete_observations`
(observación breve, interna del equipo o marcada como compartible con la
familia, con vínculo opcional a una sesión de la misma sede y a un objetivo de
la misma gimnasta). No toca tablas existentes, filas, roles ni objetos legacy.
Fuerza RLS, revoca `public`, `anon` y `authenticated`, no crea políticas ni
grants y se niega a reinstalarse si alguna de las tres relaciones ya existe.

- Esquema Drizzle espejo: `src/modules/athlete-progress/infrastructure/athlete-progress-schema.ts`.
  **No se exporta** desde `src/db/schema/index.ts` ni desde
  `src/db/zaltyko-schema.ts` (precedente de la PR 266) y además vive fuera de
  `src/db/schema/`, porque `pnpm validate:rls` solo valida el historial
  aplicado. Al promover el candidato a `supabase/migrations`, el espejo pasa a
  `src/db/schema/` y la migración debe superar `validate:rls`.
- Contrato: `tests/athlete-progress-contract.test.ts` (mismas tablas y columnas
  en candidato, espejo y detección; RLS ENABLE/FORCE y REVOKE en las tres;
  fuera de drizzle-kit; el portal de familias no las lee).
- Prueba: `tests/athlete-progress-pg.test.ts`, en el job «Postgres
  integration». Instala el candidato solo en el PostgreSQL desechable de
  GitHub y borra las tablas al terminar.
- Mientras no se aplique, `src/modules/athlete-progress/application/athlete-progress/storage.ts` (interno; se usa a través de la fachada `athlete-progress-service.ts`)
  detecta que falta y la sección responde «no disponible» (503), sin errores
  a medias.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Producto: `docs/producto/objetivos-y-observaciones.md`.

## Candidato de acceso de equipo (fase 1 + O3)

`20261105120000_canonical_team_access_candidate.sql` crea
`zaltyko.organization_member_invitations`,
`zaltyko.organization_member_invitation_scopes` y
`zaltyko.organization_team_command_receipts`. La fase 1 (5 de noviembre)
añadió las invitaciones con hash del token, las sedes y los recibos idempotentes.
O3 (11 de noviembre) añade en las invitaciones la ficha del equipo a la que
van: `staff_profile_id`, con clave foránea compuesta a `zaltyko.staff_profiles`,
o `invitee_given_name` e `invitee_family_name` para una ficha nueva, con un
CHECK de «exactamente una de las dos». No cambia relaciones existentes; al
aceptar, el servidor rellena `staff_profiles.member_id`.

- Fuerza RLS y revoca a `public`, `anon` y `authenticated`. Se niega a
  reinstalarse si alguna relación ya existe.
- `src/modules/staff/application/canonical-team-access-schema.ts` compara el
  catálogo con el manifiesto exacto: columnas, restricciones, índices, RLS, ACL
  y triggers de las FK. Ante cualquier desviación, 503.
- Prueba: `tests/canonical-team-access-pg.test.ts` (replay y job «Postgres
  integration»).
- Producto: `docs/producto/invitaciones-equipo.md`.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La función sigue además detrás de
  `ZALTYKO_TEAM_ACCESS_ENABLED`.

## Criterio de revisión y aplicación futura

1. Verificar el hash exacto del SQL generado, su manifiesto y la procedencia.
2. Exigir instalación del mismo archivo en PostgreSQL desechable con
   `postgres` no-superusuario, `BYPASSRLS`, permisos CREATE y sin membresía de
   `supabase_admin`; comprobar ACL/RLS, aislamiento y denegaciones.
3. Confirmar que el modo ausente y la reinstalación se rechazan sin efectos
   parciales, preservando los objetos legacy de control.
4. Revalidar el catálogo destino inmediatamente antes de cualquier aplicación.
   Si existen esquemas/objetos objetivo, no ocultarlos con IF NOT EXISTS:
   preparar otro diff.
5. Obtener autorización humana separada sobre el archivo/hash, el destino y
   la instalación de extensión. Solo entonces definir el procedimiento de
   aplicación/versionado y su verificación posterior. No inferirlo de CI verde.

La prueba de base desechable no acredita una instalación Supabase completa,
PostgREST, un usuario servidor productivo distinto, migración de datos legacy,
Stripe Live ni publicación del MVP. No contiene procedimientos de rollback
destructivo de datos. El ensayo natural de impago permanece independiente.

El bootstrap de CI es un superusuario distinto de `postgres`, para probar la
instalación trusted sin conceder SUPERUSER al propietario del candidato. No
se afirma equivalencia del propietario de cada objeto de extensión con el
bootstrap productivo. PostgreSQL ejecuta los scripts trusted como bootstrap,
aunque la extensión pertenezca al llamador: [documentación PostgreSQL17](https://www.postgresql.org/docs/17/sql-createextension.html).
