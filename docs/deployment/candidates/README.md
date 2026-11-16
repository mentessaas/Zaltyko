# Candidatos SQL: aplicados y pendientes de autorización

Estos archivos están fuera de `supabase/migrations` deliberadamente. No forman
parte del historial aplicable, no se recorren automáticamente y no recuperan
migraciones perdidas. No ejecutar el directorio ni aplicar el snapshot sandbox
completo sobre una base existente.

## Estado a 12-11-2026

Con autorización expresa de Elvis, el 12-11-2026 se aplicaron en producción
(Supabase «Zaltyko», PostgreSQL 17.6) las candidatas de esta tabla. También
están instaladas en staging (`docs/deployment/staging.md`). Los archivos siguen
en esta carpeta sin edición y con los mismos hashes; no se han movido a
`supabase/migrations`.

| Candidata | SHA-256 | Producción | Staging |
|---|---|---|---|
| `20261110180000_competitive_intelligence_candidate.sql` | `e2d73a30141b8a9a8ebb81003a4afda8ae68e1e188876ec19d76f5511f982686` | Aplicada 12-11-2026 | Instalada |
| `20261111120000_athlete_progress_candidate.sql` | `39aedb9e2d6c2e95db14fc72ffa0696ffa73b20c67f14eed42331cde39d419a1` | Aplicada 12-11-2026 | Instalada |
| `20261111200000_session_plans_candidate.sql` | `3aa5286ba3e86f58fea04832f596caabf06e42ee52d5ea7d3954d0cd43970bc8` | Aplicada 12-11-2026 | Instalada |
| `20261111180000_coach_assignment_candidate.sql` | `67c7c3ce25a907984127cb8c1caefcc58b5a32b1662c0abc4eb815afb0fa9f39` | Aplicada 12-11-2026 | Instalada |
| `20261110120000_admission_requests_candidate.sql` | `cc3534438ca14a25086f33d14850ad361daf22891ec1d29f1f01e533643f62ea` | Aplicada 12-11-2026 | Instalada |
| `20261105120000_canonical_team_access_candidate.sql` | `7cf243a8f3070c4068a766f63fa49a27828f3e794481e381ae08a5d09490bbe2` | Aplicada 12-11-2026 | Instalada |
| `20261104121000_mx_general_identity_candidate.sql` | `3abd3903f65b07cd7b133e60d28d1e283dc2dff0038f680b65b9dc0a819e57e6` | Aplicada 12-11-2026 | Instalada |
| `20261112120000_general_market_identity_candidate.sql` | `11886ac0b009eeabf5660e332ee7b56b638abe62a25a0b54e319ce0e36352c0e` (según el PR #290) | Aplicada 12-11-2026 | Instalada |

- **Verificación posterior en producción:** las 22 tablas nuevas tienen RLS
  `ENABLE` y `FORCE` y ningún privilegio para `anon` ni `authenticated`;
  `session_staff_profile_fk` quedó en `CASCADE`. `ZALTYKO_TEAM_ACCESS_ENABLED=true`
  en el entorno Production de Vercel.
- **`20261112120000_general_market_identity_candidate.sql`** y su sección llegan
  con el PR #290 (alta en cualquier país), abierto cuando se escribe esto. Esa
  sección dice «No se ha aplicado en ningún entorno»; esta tabla la sustituye.
- **Semillas de referencia:** no son candidatas, pero la instalación del esquema
  no sirve sin ellas. El 12-11-2026 se cargaron en producción la versión de
  términos `v1-2026-10-26` y la semilla
  `supabase/migrations/20261024223700_seed_owner_bootstrap_sport_profiles.sql`.
  Ver `docs/qa/owner-signup-reference-seeds-incident-2026-11-12.md`.
- **Instalación canónica** (`20261025202902`, 394 KB): aplicada en producción
  el 25-10-2026, sin las filas de referencia. Ver su sección.
- **Pendiente:** versionar en `supabase/migrations` lo ya aplicado (y pasar los
  espejos Drizzle a `src/db/schema/`, superando `validate:rls`), en una PR
  propia. Tampoco cambia que `tests/admission-requests-pg.test.ts` siga fuera de
  `scripts/ci/verify-sandbox-schema-replay.sh`.

## Activación del 12-11-2026 y derechos de datos

Según Elvis, el 12-11-2026 se crearon en producción, con RLS forzado, las
tablas de seis candidatos: solicitudes de prueba, panel de competencia,
objetivos y observaciones, titulares y sustituciones, guion de sesión y acceso
de equipo. Siguen fuera de `supabase/migrations`. Las notas
«No se ha aplicado en ningún entorno» de cada candidato describen el estado
anterior a esa fecha.

Hasta el 13-11-2026, la exportación de academia fallaba cerrada (503) en
cuanto existían esas tablas, porque las trataba como desconocidas. Ahora
`src/modules/data-rights/` las cubre así:

- **Exportación de academia** (`catalog.ts`, `OPTIONAL_INCLUDED_EXPORT_MODULES`).
  - Objetivos y observaciones, titulares y sustituciones, guion de sesión y
    solicitudes de prueba se exportan con sus valores, igual que el núcleo,
    con la misma comprobación exacta de columnas.
  - Cada función está instalada entera o no está: si falta una tabla o aparece
    una columna sin clasificar, la exportación falla cerrada.
  - Se omiten las claves de reintento y el token del enlace público. Los
    bloques `jsonb` del modelo de la clase se exportan solo con sus campos
    clasificados (`kind`, `discipline`, `apparatus`, `content`,
    `durationMinutes`); el verificador rechaza cualquier otra clave.
  - El acceso de equipo sigue dando solo recuentos.
  - Sin las tablas, el paquete es idéntico al anterior.
- **Verificación, recuperación y disposición.** El verificador de archivos y
  el plan de disposición aceptan las mismas funciones, todas o ninguna.
  El preflight de recuperación aún no diagnostica sus relaciones y sigue
  bloqueado.
- **Supresión y conservación** (`activated-modules-erasure-policy.ts`).
  - Declara, por tabla, qué pasa al borrar una gimnasta, una integrante, una
    cuenta de Auth o la academia. Son las claves foráneas instaladas, no un
    procedimiento de borrado.
  - Declara la anonimización manual de las solicitudes descartadas, sin plazo
    automático: la propuesta de 90 días sigue pendiente de decisión legal.
- **Panel de competencia.** Las tablas `public.ci_*` constan como catálogo
  interno sin datos de clientes (`INTERNAL_NON_CUSTOMER_TABLES`), fuera del
  paquete de academia. La semilla (`semilla-2026-11.json`) marca ya solicitud
  de prueba, titulares y acceso de entrenadoras como `completo`, y progreso
  técnico como `parcial`. Pero solo inserta lo que falta: si la base de
  producción ya tenía cargados esos flujos, hay que cambiar su estado a mano
  en `/super-admin/competencia`.
- **Supresión de cuentas (14-11-2026).** Borrar una cuenta fallaba en cuanto
  la persona tenía autoría en la academia. Lo resuelve la candidata
  `20261114120000_account_erasure_candidate.sql` (sección propia, abajo), aún
  sin aplicar. **Pendiente, en una PR propia:** la ficha de una gimnasta que
  vino de una solicitud sigue sin poder borrarse. Detalle:
  `docs/privacy/borrado-de-cuentas-y-fichas.md`.
- **Contrato.** `tests/data-rights-activated-modules-contract.test.ts` lee
  todo el SQL y falla si una tabla `zaltyko.*` queda sin clasificar, si las
  columnas exportadas no coinciden con el candidato o si la política de
  supresión no coincide con sus claves foráneas.

**Los espejos Drizzle siguen fuera de `src/db/schema/`.** data-rights lee
`information_schema` y no los necesita. `drizzle.config.ts` solo lee tres
archivos concretos, así que moverlos no expondría las tablas a drizzle-kit.
Pero `pnpm validate:rls` recorre todo `src/db/schema/` y exige a cada tabla
con academia RLS y al menos una política en `supabase/migrations`. Estos
candidatos no están en ese historial y no tienen políticas (deniegan todo a
los clientes), así que fallaría. Los contratos de cada función también exigen
que el espejo no viva ahí. Pasarán a `src/db/schema/` cuando cada candidato
se promueva a `supabase/migrations` en una PR propia con su cadena de replay.

## Niveles y progresión por aparato (candidata nueva, sin aplicar)

**Estado: `20261114121000_skill_levels_candidate.sql` no está aplicada en ningún entorno y requiere autorización de Elvis.** No consta en la tabla de arriba: esa tabla recoge lo aplicado el 12-11-2026.

- **Qué crea.** Cinco relaciones nuevas en `zaltyko` (`skill_templates`, `skill_levels`, `skill_elements`, `athlete_skill_progress`, `athlete_level_passes`), aditivas, con RLS `ENABLE` + `FORCE` y `REVOKE` a `anon` y `authenticated`. Reinstalar aborta antes de tocar nada si alguna ya existe.
- **Bandera.** Además de las tablas hace falta `ZALTYKO_SKILL_LEVELS_ENABLED=true` (apagada por defecto). Con una de las dos cosas sin hacer, la función no existe (404 en páginas, 503 en API, nada en `/familia`).
- **Derechos de datos.** Ya constan en la exportación de academia, el verificador, el plan de disposición y la política de supresión (módulo `skill_levels`), de modo que aplicarla no rompe la exportación.
- **SHA-256:** `d6492c9d9fdaf0ebc8280b3370c9553237e6c9ef2037844c09d6dd5e93117d02`. Si el archivo cambia, este hash debe cambiar con él.
- **Autoría y sede opcionales.** Las claves foráneas a miembros del equipo y a sedes son `on delete set null (columna)` y tienen su índice: dar de baja a una entrenadora o una sede no se bloquea por su historial, que queda sin autoría.
- **Marca de tiempo.** `20261114121000`, para no chocar con la PR 319.
- **Reversión (rollback).** La candidata solo crea cinco tablas nuevas, así que se deshace borrándolas, en este orden y solo si se confirma que no hay datos que conservar (borrarlas destruye el progreso y los pasos de nivel):

```sql
begin;
drop table if exists zaltyko.athlete_level_passes;
drop table if exists zaltyko.athlete_skill_progress;
drop table if exists zaltyko.skill_elements;
drop table if exists zaltyko.skill_levels;
drop table if exists zaltyko.skill_templates;
commit;
```

  Antes, apagar `ZALTYKO_SKILL_LEVELS_ENABLED`: sin la bandera la función deja de existir sin tocar datos. Tras el borrado, la exportación de la academia vuelve al paquete anterior (el módulo está ausente entero).
- **Espejo Drizzle** fuera de `src/db/schema/`, como los demás candidatos.
- **Producto y prueba en staging:** `docs/producto/niveles-y-progresion.md`.

## Candidato de instalación canónica

**Estado: aplicada en producción el 25-10-2026** con autorización expresa
sobre este archivo y destino (`jegxfahsvugilbthbked`, migración nativa
`20261025222531_canonical_domain_installation_candidate`). Evidencia:
`docs/qa/canonical-production-application-2026-10-25.md`. El SQL y su hash no
cambian. Se aplicó **sin las filas de referencia** (el candidato no incluye
filas): `zaltyko.owner_signup_consent_policy` y `zaltyko.sport_profiles`
quedaron vacías y el registro de dueñas falló hasta el 12-11-2026. Ver
`docs/qa/owner-signup-reference-seeds-incident-2026-11-12.md`. Las frases de
abajo marcadas «hasta el 25-10-2026» describen el estado anterior.

La CLI Supabase 2.84.2 creó el nombre
`20261025202902_canonical_domain_installation_candidate.sql` mediante
`supabase migration new canonical_domain_installation_candidate`. Se apartó
inmediatamente el archivo vacío a esta carpeta, antes de añadir cualquier SQL.
Su contenido se generó en CI a partir del AST y el snapshot fijados y se copió
sin edición desde el artefacto. No procede de recortes de texto del dump.
CI40232012970 comprobó la instalación y el rechazo de replay del archivo exacto.
SHA-256: `00ead5a3869bb335f2f17e58ebaaacac2bdc1ae4504493b473c68393359dab00`.
Ver `docs/qa/canonical-installation-candidate-proof-2026-10-25.md` para evidencia
y límites; *hasta el 25-10-2026:* sigue pendiente de revisión y autorización productiva separada.

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
autorización humana. *Hasta el 25-10-2026:* No configurarlos ni ejecutar el modo productivo todavía.

## Candidato de perfiles de identidad de México

`20261104121000_mx_general_identity_candidate.sql` no crea tablas: inserta dos
filas de referencia en `zaltyko.sport_profiles`, MX `artistic` y MX
`rhythmic`, con `federation_code = 'unconfigured'`, `profile_version =
'identity-v1'`, estado `identity_only`, `configuration_schema_version = 1` y
configuración `{}`. Es la misma forma que las filas de España de
`supabase/migrations/20261024223700_seed_owner_bootstrap_sport_profiles.sql`.
Aborta si ya existe una de esas claves con otra forma y no toca las que ya
tienen la forma esperada. No cambia esquema, políticas ni permisos.

- SHA-256: `3abd3903f65b07cd7b133e60d28d1e283dc2dff0038f680b65b9dc0a819e57e6`.
- Prueba: `tests/international-bootstrap-pg.test.ts` (lo instala dos veces en
  PostgreSQL desechable para comprobar que es repetible).
- Contexto: `docs/qa/mx-general-identity-profile-draft-2026-11-04.md`.
- Sin estas filas, el alta de una academia mexicana falla cerrada.

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

## Candidato de solicitudes de prueba (P2 #15)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

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
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Contexto y corte mínimo: `docs/producto/embudo-captacion.md`.

## Candidato del panel de inteligencia competitiva (super-admin)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

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
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** Solo se ha instalado en un
  PostgreSQL efímero local para comprobar el panel (10-11-2026); no se ha
  aplicado en sandbox ni en producción.

## Candidato de objetivos y observaciones por gimnasta (P2 #17)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

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
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Producto: `docs/producto/objetivos-y-observaciones.md`.

## Candidato de titulares por clase y sustituciones (O1)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. En producción, `session_staff_profile_fk` quedó en
`CASCADE`. Lo que sigue conserva la descripción de la revisión; las notas
marcadas «hasta el 12-11-2026» describen el estado anterior.

`20261111180000_coach_assignment_candidate.sql` crea solo
`zaltyko.class_template_staff` (titulares de cada clase, con quién las asignó)
y `zaltyko.session_staff_overrides` (marca de sustitución de una sesión, con un
motivo de código cerrado, quién y cuándo). Quién entrena en cada sesión sigue
en `zaltyko.session_staff`, ya aplicada en
`supabase/migrations/20261006080702_establish_zaltyko_domain_foundation.sql`.
No toca filas, roles ni objetos legacy. Fuerza RLS, revoca `public`, `anon`
y `authenticated`, no crea políticas ni grants y se niega a reinstalarse si
alguna de las dos relaciones ya existe. Sobre objetos existentes solo hace una
cosa en dos pasos sobre `zaltyko.session_staff`, que pasa a tener datos
reales: retira a `anon` y `authenticated` el acceso directo y pasa
`session_staff_profile_fk` de RESTRICT a CASCADE (Decide Elvis: tabla ya
aplicada). Ninguna FK bloquea borrados: cascada en las asignaciones y
`on delete set null (columna)` en quien asignó o sustituyó. **Requiere
PostgreSQL 15 o superior**: el preflight aborta en versiones anteriores
(Elvis: confirmar la versión de producción). *Confirmado el 12-11-2026:
producción usa PostgreSQL 17.6.*

- Esquema Drizzle espejo: `src/modules/coach-assignment/infrastructure/coach-assignment-schema.ts`.
  **No se exporta** desde `src/db/schema/index.ts` ni desde
  `src/db/zaltyko-schema.ts` y vive fuera de `src/db/schema/`, como el
  candidato de la PR 271.
- Contrato: `tests/coach-assignment-contract.test.ts`.
- Prueba: `tests/coach-assignment-pg.test.ts`, en el job «Postgres
  integration». Instala el candidato solo en el PostgreSQL desechable de
  GitHub y borra las tablas al terminar.
- Mientras no se aplique, `coach-assignment/storage.ts` detecta que falta: las
  rutas responden 503 (`coach_assignment_storage_unavailable`), las pantallas
  ocultan titulares y sustituciones, y la generación de sesiones no cambia.
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Producto: `docs/producto/entrenadoras-por-clase.md`.

## Candidato de planificación sobre sesiones (P2 #17, segunda parte)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

`20261111200000_session_plans_candidate.sql` crea solo
`zaltyko.session_plans` (el «guion de la sesión», uno por sesión: foco del
día, nota, revisión del modelo copiado y la última petición para reintentos), `zaltyko.session_plan_blocks` (hasta 20 bloques con
tipo, disciplina GAF/GAM/rítmica y aparato de una lista cerrada, contenido
libre, duración aproximada y marca de hecho), `zaltyko.session_plan_objectives`
(objetivos de gimnastas que el plan trabaja) y `zaltyko.class_plan_templates`
(el «modelo de la clase», opcional, con los bloques en `jsonb`). La posición
de los bloques es única y diferida, para reordenarlos en su sitio. No toca tablas
existentes, filas, roles ni objetos legacy. Fuerza RLS, revoca `public`,
`anon` y `authenticated`, no crea políticas ni grants y se niega a
reinstalarse si alguna de las cuatro relaciones ya existe.

- **Depende del candidato de objetivos y observaciones**
  (`20261111120000_athlete_progress_candidate.sql`): su preflight aborta si
  `zaltyko.athlete_objectives` no existe. Se aplican en ese orden.
- La FK a `zaltyko.sessions` queda en NO ACTION: ningún flujo borra sesiones
  (`tests/zaltyko-sessions-never-deleted.test.ts`).
- Esquema Drizzle espejo: `src/modules/session-plans/infrastructure/session-plan-schema.ts`,
  fuera de `src/db/schema/` y sin exportarse desde los índices, igual que el
  espejo de objetivos.
- Contrato: `tests/session-plans-contract.test.ts`.
- Prueba: `tests/session-plans-pg.test.ts`, en el job «Postgres integration».
  Instala los dos candidatos solo en el PostgreSQL desechable de GitHub y
  borra las tablas al terminar.
- Mientras no se aplique, la detección interna de `session-plan/storage.ts`
  (a través de la fachada `session-plan-service.ts`) responde «no disponible»
  (503) y Pasar lista no muestra el plan.
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.
- Producto: `docs/producto/planificacion-sesiones.md`.

## Candidato de acceso de equipo (fase 1 + O3)

**Estado: aplicada en producción el 12-11-2026 con autorización de Elvis.**
También está instalada en staging (`docs/deployment/staging.md`). El archivo y
su hash no cambian. Lo que sigue conserva la descripción de la revisión; las
notas marcadas «hasta el 12-11-2026» describen el estado anterior.

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
- *Hasta el 12-11-2026:* **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La función sigue además detrás de
  `ZALTYKO_TEAM_ACCESS_ENABLED`.

## Candidato del acceso de familias y los avisos de sesión

**Estado: requiere autorización de Elvis para aplicarse.** No se ha aplicado
en ningún entorno (ni staging ni producción). La CI verde no equivale a
autorización. La función sigue además detrás de
`ZALTYKO_FAMILY_ACCESS_ENABLED`, apagada por defecto (solo vale el valor
exacto `true`).

`20261114121500_family_access_notices_candidate.sql` crea solo cuatro
relaciones:

- `zaltyko.guardian_access_invitations`: invitación de un solo uso al portal
  de familias, atada a un tutor (`guardian_id`). Guarda el SHA-256 del token
  (32 bytes aleatorios), nunca el token; el correo normalizado al que se
  invitó; caducidad (7 días), revisión, último envío, y quién invitó, aceptó o
  revocó. Una sola pendiente por tutor (índice único parcial).
- `zaltyko.family_notices`: aviso de la academia (sesión cancelada, cambio de
  horario, sustitución o aviso manual a una clase o un grupo), con
  `dedupe_key` única por academia para que el mismo cambio no cree dos avisos.
- `zaltyko.family_notice_recipients`: un registro por tutor destinatario con
  la lectura en el portal (`read_at`) y el resultado del correo. No guarda
  direcciones de correo.
- `zaltyko.guardian_notification_preferences`: preferencias de correo de cada
  tutor (cambios de sesión y avisos manuales), por defecto activadas.

No altera tablas existentes, filas, roles ni objetos legacy. Al aceptar una
invitación, el servidor escribe columnas que ya existen:
`guardians.auth_user_id` y, si la academia lo confirmó al invitar,
`family_guardians.can_view_athletes = true`. Fuerza RLS, revoca a `public`,
`anon` y `authenticated`, no crea políticas ni grants, exige PostgreSQL 15+
(`on delete set null (columna)`) y se niega a reinstalarse si alguna de las
cuatro relaciones ya existe.

- SHA-256: `4143ebef55bdd0f0c97585dcda1259ed8912c0db2fe01400286a5febe0e02811`.
- Detección: `src/modules/family-access/application/family-access-storage.ts`
  compara tablas, columnas, RLS forzado y ausencia de privilegios de clientes.
  Sin el candidato exacto, la función responde 503 y `/owner/familias`,
  `/familia/avisos` y `/familia/aceptar` no existen (404).
- FK a `zaltyko.sessions`, `class_templates` y `groups` en NO ACTION: se
  cancelan o archivan por estado, nunca se borran
  (`tests/zaltyko-sessions-never-deleted.test.ts`).
- Derechos de datos: módulo `family_access` de
  `OPTIONAL_INCLUDED_EXPORT_MODULES` (`src/modules/data-rights/application/catalog.ts`),
  con valores para que la academia atienda el derecho de acceso de un tutor;
  sin el hash del token, el identificador de Auth ni la instantánea de
  vínculos. Las cuatro tablas o ninguna. Política de supresión en
  `activated-modules-erasure-policy.ts`.
- `grant_links`: vínculos familia-tutor (id y versión) que la academia vio al
  invitar; al aceptar solo se concede ver gimnastas en esos y si no cambiaron.
  `email_attempts`: reintentos del correo de un aviso (hasta 3), que hace el
  cron `/api/cron/family-notices` (CRON_SECRET; lo lanza pg_cron cada 10
  minutos desde el 15-11-2026, `docs/deployment/scheduler/`).
- **Retirar acceso con la bandera apagada.** Si se apaga
  `ZALTYKO_FAMILY_ACCESS_ENABLED` con las tablas instaladas, `/owner/familias`
  pasa a modo «solo retirar acceso» (dirección o administración con todas las
  sedes): lista las familias con cuenta vinculada y permite retirarla, con
  auditoría. Ni invitaciones ni avisos. Si las tablas no existen, ninguna
  cuenta pudo vincularse por esta vía.
- Contrato: `tests/family-access-candidate-contract.test.ts`. Prueba:
  `tests/family-access-pg.test.ts` en el job «Postgres integration»; instala
  el candidato solo en el PostgreSQL desechable de GitHub y borra sus tablas al
  terminar.
- Producto: `docs/producto/familias-acceso-y-avisos.md`. Privacidad:
  `docs/privacy/familias-acceso-y-avisos.md`.

### Verificación (después de aplicar, solo lectura)

```sql
select c.relname, c.relrowsecurity, c.relforcerowsecurity,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'zaltyko'
  and c.relname in ('guardian_access_invitations', 'family_notices',
                    'family_notice_recipients', 'guardian_notification_preferences')
order by c.relname;
-- Esperado: 4 filas, RLS y FORCE en true, sin acceso de anon ni authenticated.
```

Después, con `ZALTYKO_FAMILY_ACCESS_ENABLED=true` solo en el entorno que se
pruebe, `/owner/familias` debe abrirse (si la detección falla, sigue en 404).

### Rollback (solo si no hay datos que conservar)

Apagar primero la bandera (`ZALTYKO_FAMILY_ACCESS_ENABLED` sin valor o
distinto de `true`): la función queda dormida sin tocar la base. Borrar las
tablas elimina invitaciones, avisos y lecturas; las cuentas ya vinculadas
(`guardians.auth_user_id`) y los permisos `can_view_athletes` concedidos se
conservan, porque son columnas existentes. Requiere autorización de Elvis:

```sql
begin;
drop table zaltyko.family_notice_recipients;
drop table zaltyko.family_notices;
drop table zaltyko.guardian_notification_preferences;
drop table zaltyko.guardian_access_invitations;
commit;
```

## Candidato de alta abierta a cualquier país

`20261112120000_general_market_identity_candidate.sql` crea solo la función
`zaltyko_domain_private.ensure_general_identity_sport_profile(text, text)`.
Decisión de producto de Elvis (12-11-2026): cualquier academia puede
registrarse desde cualquier país; España y México siguen siendo los mercados
completos y lo específico de cada país (federación, competiciones, cobros
locales y facturación) llegará más adelante.

- Por qué una función y no un perfil genérico: `organization_sports` exige el
  mismo `country_code` en la organización y en el perfil deportivo
  (`organization_sports_country_fk` y `organization_sports_profile_fk`). Un
  país reservado común no encaja sin cambiar esas claves, y sembrar ~250
  países por adelantado se descartó. La función crea, solo si falta, el perfil
  de identidad vacío del país y la disciplina pedidos, con la misma forma que
  los de ES y MX (`unconfigured`, `identity-v1`, `identity_only`, versión 1,
  configuración `{}`). Si ya existe un perfil con otra forma no lo toca y
  devuelve null: el alta falla cerrada con 422.
- Se niega a tocar ES y MX (datos revisados), solo admite `artistic` y
  `rhythmic` y códigos `^[A-Z]{2}$`. `SECURITY INVOKER` con `search_path`
  vacío; `REVOKE` a `public`, `anon` y `authenticated`; `EXECUTE` solo para
  `service_role` (y el propietario). No cambia tablas, filas existentes, RLS,
  roles ni objetos legacy. El preflight aborta si la función ya existe.
- SHA-256: `11886ac0b009eeabf5660e332ee7b56b638abe62a25a0b54e319ce0e36352c0e`.
- Prueba: `tests/general-market-bootstrap-pg.test.ts`, en el job «Postgres
  integration». Instala el candidato solo en el PostgreSQL desechable de
  GitHub y retira la función al terminar.
- Mientras no se aplique, `bootstrap-organization.ts` detecta que falta
  (`to_regprocedure`) y el alta de países fuera de ES y MX responde 422
  `FEATURE_NOT_AVAILABLE` («Todavía no podemos completar desde aquí el alta de
  academias de este país. No se ha creado nada…»), sin escrituras ni 500.
  ES y MX no pasan por la función.
- Orden recomendado: aplicar el candidato antes (o a la vez) que desplegar el
  código, porque la web pública ya dirá que el alta es abierta. Aplicarlo antes
  es inocuo: nada lo llama hasta que el código nuevo esté en producción.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.

## Candidato de uso habitual (medición, 14-11-2026)

`20261114130000_habitual_use_candidate.sql` crea una relación nueva, `public.usage_events`, y dos índices sobre `zaltyko.sessions` (`sessions_starts_at_idx`, `sessions_ends_at_idx`), sin cambiar filas ni columnas existentes: contadores de uso por academia, tipo de evento (`staff_visit`, `family_portal_view`), rol y día. Producto y flujo: `docs/producto/uso-habitual.md`.

- No guarda identificadores de persona, de cuenta, de gimnasta ni de menor, ni IP ni texto libre. Solo los eventos de familia llevan `actor_ref`: 16 hexadecimales de un HMAC con un secreto propio (`ZALTYKO_USAGE_PSEUDONYM_SECRET`) que rota cada semana. **Es un seudónimo, no un dato anónimo**: quien tenga el secreto puede recalcularlo para una cuenta conocida. Sirve para contar cuentas distintas en una semana, no para seguir a una familia entre semanas.
- Esquema `public` (como `growth_events`): telemetría interna del producto. Enlaza con `zaltyko.organizations` con `ON DELETE CASCADE`, así que borrar la academia borra su uso. RLS `ENABLE` y `FORCE`, `REVOKE ALL` a `public`, `anon` y `authenticated`, sin políticas.
- Los dos índices de `sessions` aceleran las búsquedas por hora de los avisos a entrenadoras, que miran todas las academias a la vez. Sin ellos los avisos funcionan, más despacio.
- Bandera apagada por defecto: `ZALTYKO_HABITUAL_USE_ENABLED` más `ZALTYKO_USAGE_METRICS_ENABLED`. Mientras la tabla no exista tal como la define el archivo no se registra nada y `/super-admin/uso` responde «no disponible». Los avisos por correo no usan la tabla.
- El preflight aborta si `public.usage_events` o alguno de los índices ya existe, o si faltan `zaltyko.organizations` o `zaltyko.sessions`.
- **Vuelta atrás documentada** (al final del propio archivo; no forma parte de la instalación): `drop index if exists zaltyko.sessions_starts_at_idx; drop index if exists zaltyko.sessions_ends_at_idx; drop table if exists public.usage_events;`. Solo se pierden los contadores de uso: ningún dato de la academia depende de ellos, y con las banderas apagadas la aplicación vuelve sola a «no disponible». `tests/habitual-use-pg.test.ts` ejecuta esa vuelta atrás y reinstala.
- SHA-256: `716ee8543fb8f2cdf57dd939814eb72a4195f2342fa19efea94b635f98c04b68`.
- Pruebas: `tests/habitual-use-routes-and-contract.test.ts` (columnas, índices, RLS, ausencia de datos personales y hash) y `tests/habitual-use-pg.test.ts` en el job «Postgres integration», que instala el candidato solo en el PostgreSQL desechable de GitHub y retira lo creado al terminar.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en ningún entorno. La CI verde no equivale a autorización.

## Candidato de supresión de cuentas (RGPD art. 17)

`20261114120000_account_erasure_candidate.sql` hace posible suprimir una cuenta
de Supabase Auth y su perfil legacy sin perder los registros que cada academia
debe conservar. La pertenencia (`zaltyko.organization_members`) deja de
borrarse en cascada: el servidor la revoca y, al borrar la cuenta, `user_id`
pasa a null. Cambia, sobre tablas ya aplicadas (decisión por tabla en
`docs/privacy/borrado-de-cuentas-y-fichas.md`):

- `organization_members.user_id`: CASCADE → SET NULL, sin NOT NULL, con el
  CHECK `organization_members_erased_account_revoked_ck` (sin cuenta ⇒
  revocada). Un borrado directo de `auth.users` falla entero si la cuenta sigue
  activa en alguna academia.
- `payments.recorded_by_user_id` e `insight_actions.actor_user_id`: RESTRICT →
  SET NULL (sin NOT NULL en el segundo). `payments_source_fields_valid` deja de
  exigir quién anotó un pago manual; el resto del CHECK no cambia.
- `organization_member_invitations.accepted_by_user_id`: NO ACTION → SET NULL,
  y el CHECK de estado (mismo nombre) ya no exige la cuenta en «aceptada»;
  sigue exigiendo `accepted_member_id`. El servidor sustituye antes su email y
  nombre. `organization_team_command_receipts.actor_user_id`: NO ACTION →
  CASCADE.
- `zaltyko_domain_private.reject_audit_mutation()` y
  `reject_insight_history_mutation()`: siguen rechazando UPDATE y DELETE,
  salvo el vaciado de `actor_user_id` que hace la propia clave al borrar la
  cuenta (solo esa columna, y solo si la cuenta ya no existe). Mismos triggers.
- Directorio público: `directory_grants.user_id` → CASCADE; el resto de claves
  a `auth.users` → SET NULL.
- Perfil legacy (`public.profiles`): `academies.owner_id` CASCADE → **RESTRICT**
  (antes, borrar a la dueña borraba la academia legacy con cobros y facturas);
  `coaches.profile_id`, `announcements.author_id`,
  `conversation_messages.sender_id`, `invitations.invited_by`,
  `event_registrations.profile_id`, `ticket_responses.user_id` y
  `ticket_attachments.uploaded_by`: CASCADE → SET NULL.
- Donde quita NOT NULL, un trigger `BEFORE INSERT`
  (`zaltyko_domain_private.require_column_on_insert`, sin EXECUTE para
  `anon`/`authenticated`) sigue exigiendo el valor en filas nuevas. Donde
  relaja un CHECK, otros dos lo mantienen para registros nuevos:
  `payments_manual_recorder_required` (un pago manual nuevo necesita quién lo
  anotó) y `organization_member_invitations_acceptor_required` (una invitación
  que pasa a «aceptada» necesita su cuenta).
- Sin cambios y a propósito: `organization_saas_webhook_reconciliation_decisions.actor_user_id`
  sigue en RESTRICT (evidencia fiscal de solo inserción); las autorías hacia
  `organization_members` no se tocan.

No crea tablas ni cambia filas, roles, RLS ni permisos. El preflight comprueba
la forma exacta de cada clave, columna, CHECK y función, y aborta antes de tocar
nada si algo difiere, si se reaplica o si existe otra clave hacia `auth.users`
en cualquier esquema salvo `auth` (por ejemplo `storage`) que pueda bloquear y
no esté revisada. Exige el directorio público y las tablas legacy: si un entorno
no las tiene, aborta y hace falta otra candidata.

**Bloqueos.** `set local lock_timeout = '3s'`: si otra sesión retiene una de las
tablas, aborta sin efectos y se reintenta. Las claves y CHECK nuevos se crean
`NOT VALID` (sin recorrer las tablas con bloqueo exclusivo; ya se aplican a
filas nuevas y sus acciones `ON DELETE` funcionan). El segundo paso,
`20261114120000_account_erasure_validate.sql`, los valida con `VALIDATE
CONSTRAINT` (SHARE UPDATE EXCLUSIVE: no bloquea lecturas ni escrituras); es
repetible.

| Archivo | SHA-256 |
|---|---|
| `20261114120000_account_erasure_candidate.sql` | `713f96217777d0da34925b043add602e4cde12202290e17043554747cc1abe65` |
| `20261114120000_account_erasure_validate.sql` (segundo paso) | `db7ff76c7f9a28ad1db186d567ca6430717c0d03595cc6a41a184a3b0cb87fa9` |
| `20261114120000_account_erasure_verify.sql` (solo lectura) | `6e1f31a8bdf4bdae967c4e8a65cf16930ee13bdfad08f1b6258a554ceeaced62` |
| `20261114120000_account_erasure_rollback.sql` | `6f0344c75f479fda3f0f9d0772230eb68dfaf830d27a99d6e7bd7e27a977a9ec` |

- **Aplicar** (staging primero) y verificar:

  ```bash
  shasum -a 256 docs/deployment/candidates/20261114120000_account_erasure_*.sql
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select current_database(), version();"
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f docs/deployment/candidates/20261114120000_account_erasure_candidate.sql
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f docs/deployment/candidates/20261114120000_account_erasure_validate.sql
  PGOPTIONS='-c default_transaction_read_only=on' psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/deployment/candidates/20261114120000_account_erasure_verify.sql
  ```

  La verificación es un único bloque que solo lee el catálogo (la sesión en
  solo lectura lo garantiza). Escribe una línea `ok` por comprobación y termina
  con `Account erasure verification passed`; si algo no cuadra, falla con la
  lista. La prueba funcional con cuentas de staging está en
  `docs/privacy/borrado-de-cuentas-y-fichas.md`, «Verificar en staging».
- **Vuelta atrás:** `20261114120000_account_erasure_rollback.sql`, también con
  `-1`. Restaura las definiciones exactas y retira triggers y función, con o
  sin el paso de validación. Solo funciona mientras no se haya suprimido
  ninguna cuenta: si ya hay filas con la referencia vacía, aborta sin tocar
  nada (nunca se rellenan con otra cuenta).
- **Código:** `src/modules/data-rights/application/account-erasure.ts` y
  `DELETE /api/super-admin/users/[profileId]`. Sin la candidata, la supresión
  responde 503 y no borra nada. Antes de revocar, busca en el catálogo toda
  clave NO ACTION/RESTRICT hacia la cuenta o el perfil y responde 409 si alguna
  tiene filas de esta persona. El guardia del acceso de equipo
  (`canonical-team-access-schema.ts`) acepta la forma anterior o la posterior a
  esta candidata, nunca una mezcla. La posterior incluye su trigger revisado y
  admite sus tres restricciones aún `NOT VALID`: el acceso de equipo sigue
  disponible entre la candidata y el paso de validación, y después.
- **Espejos Drizzle legacy** (`src/db/schema/`): siguen declarando NOT NULL en
  las columnas de autor legacy que la candidata vacía al suprimir. Se ajustarán
  cuando el historial se versione; mientras, una consulta que una esas filas
  con el perfil por `inner join` no las mostrará.
- **Pruebas:** `tests/account-erasure-pg.test.ts` en el job «Postgres
  integration» (instalación, validación, verificación, rechazo de reinstalar,
  vuelta atrás idéntica, supresión real con autoría en cada tipo de registro,
  borrado del perfil legacy, triggers de autor y bloqueos), dentro de una
  transacción que se deshace; `tests/account-erasure.test.ts` y el contrato
  `tests/data-rights-activated-modules-contract.test.ts`.

## Candidato de recordatorios de impago (cobros, A3)

`20261114120500_payment_reminders_candidate.sql` crea dos relaciones nuevas en
`zaltyko`, sin tocar filas ni tablas existentes: `payment_reminder_settings`
(plantilla, datos de pago en texto libre, correo de respuesta, días mínimos
entre recordatorios y recordatorio automático apagado) y `payment_reminders`
(un registro por cuota y envío: `pending`, `sent` o `failed`). Producto y
flujo: `docs/producto/recordatorios-de-impago.md`.

- Zaltyko no cobra a las familias: el recordatorio es un aviso por correo al
  **tutor pagador** de la cuota (`family_payer_id`), con los datos de pago que
  la academia escribe. El registro no guarda correo, nombre ni texto del
  mensaje, solo `guardian_id` (pasa a null si se borra esa ficha).
- Ambas tablas: RLS `ENABLE` y `FORCE`, `REVOKE ALL` a `public`, `anon` y
  `authenticated`, sin políticas ni grants. Borrados sin bloqueos: la cuota y
  la academia en cascada; quien editó o pidió el aviso, y el tutor, pasan a
  null (PostgreSQL 15+, `on delete set null (columna)`). El preflight aborta
  si ya existe alguna de las dos o si faltan `charges`, `guardians` u
  `organization_members`.
- Bandera apagada por defecto: `ZALTYKO_PAYMENT_REMINDERS_ENABLED`. El
  recordatorio automático tiene su propia bandera
  (`ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED`) y el ajuste de cada academia, y su
  cron (`/api/cron/family-payment-reminders`) lo lanza pg_cron una vez al día
  desde el 15-11-2026 (`docs/deployment/scheduler/`). Mientras no se apliquen las tablas la función responde
  «no disponible» (503) y la sección no aparece en `/owner/payments`.
- Derechos de datos: la exportación de academia incluye las dos tablas cuando
  están instaladas (módulo `payment_reminders` del catálogo) y la política de
  supresión las clasifica; `tests/data-rights-activated-modules-contract.test.ts`
  lo comprueba contra este SQL.
- SHA-256: `15e657f762d7576385b8f4c9070fee3066ff70408c464505ff4a32722b9be668`.
- Pruebas: `tests/payment-reminders-contract.test.ts` (candidato, espejo
  Drizzle y detección de almacenamiento) y `tests/payment-reminders-pg.test.ts`,
  en el job «Postgres integration». Instala el candidato solo en el PostgreSQL
  desechable de GitHub y retira las tablas al terminar.
- Índices en `guardian_id`, `requested_by_member_id` y `updated_by_member_id`:
  las tres claves que pasan a null al borrar a una persona no recorren la tabla.
- La marca de tiempo es `20261114120500` (no choca con la PR 321).
- **Rollback.** Apagar antes `ZALTYKO_PAYMENT_REMINDERS_ENABLED` (la detección de
  almacenamiento ya devuelve «no disponible» sin cambios de código). Las dos
  tablas no tienen dependientes: ninguna otra relación las referencia. Borrarlas
  descarta la plantilla y el historial de avisos; exportarlos antes si importan.

  ```sql
  begin;
  drop table if exists zaltyko.payment_reminders;
  drop table if exists zaltyko.payment_reminder_settings;
  commit;
  ```

  `tests/payment-reminders-pg.test.ts` ejecuta exactamente estos dos `drop` al
  terminar. Comprobación posterior: `to_regclass('zaltyko.payment_reminders')` es
  null y `/owner/payments` ya no muestra la sección.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.

## Candidata de Conectar Stripe (cobro automático, Fase 1)

| Candidata | SHA-256 | Producción | Staging |
|---|---|---|---|
| `20261116120000_connect_onboarding_candidate.sql` | `e07a8129b2e935ede4b0755e33b731a6613c76b2ac8e616f239949665735eb0a` | No aplicada | Aplicada 16-11-2026 (autorizado por Elvis) |

**Staging, 16-11-2026.**
- Aplicada en «Zaltyko Staging» (`oucxnnrtfmjjlnffldfc`) con el MCP de Supabase, con el texto exacto del archivo (SHA comprobado).
- Comprobado después en el catálogo:
  - las dos columnas son `text not null`, con sus valores por defecto;
  - existen los dos checks con su nombre;
  - RLS sigue en `ENABLE` y `FORCE`;
  - la tabla tenía 0 filas.
- **Producción: sin aplicar.** Necesita otra autorización expresa.

Añade dos columnas a `zaltyko.organization_payment_provider_accounts`, sin
crear tablas ni tocar permisos (la tabla ya es solo de `service_role`, con RLS
`ENABLE` y `FORCE`). Decisión: `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`.

- `sepa_debit_payments_capability_status text not null default 'pending'`,
  con `btrim(...) <> ''`. Informativa en la Fase 1: el estado de la cuenta
  depende solo de la tarjeta.
- `requirements_state text not null default 'user_action'`, con check
  `in ('none', 'user_action', 'stripe_review', 'past_due')`. Solo un código,
  nunca datos personales ni la lista de requisitos de Stripe.
- El preflight aborta si falta la tabla o si ya existe alguna de las dos
  columnas: reinstalar no toca nada.
- Espejo Drizzle en `src/db/schema/zaltyko-core.ts` (la tabla ya está en
  `supabase/migrations`, así que `validate:rls` no cambia). Hasta aplicarla,
  ningún código debe leer o insertar en la tabla con Drizzle sin columnas
  explícitas: las dos columnas no existen en la base.
- Bandera apagada por defecto: `ZALTYKO_CONNECT_ONBOARDING_ENABLED`. Mientras
  las columnas no existan, `isConnectOnboardingStorageAvailable()`
  (`src/modules/payments-connect/application/storage.ts`, solo lee
  `information_schema.columns`) devuelve `false` y la función responde «no
  disponible» (`connect_onboarding_unavailable`).
- Pruebas: `tests/payments-connect-pg.test.ts`, en el job «Postgres
  integration». Instala la candidata solo en el PostgreSQL desechable de
  GitHub y retira las dos columnas al terminar.
- **Aplicación en producción.** El archivo no se cambia (su SHA es el aplicado
  en staging). Se ejecuta su texto exacto dentro de una transacción con
  `lock_timeout`, para que no espere detrás de otra sesión con la tabla
  bloqueada:

  ```sql
  begin;
  set local lock_timeout = '5s';
  -- texto exacto de 20261116120000_connect_onboarding_candidate.sql
  commit;
  ```

  El archivo no abre su propia transacción, así que el envoltorio hace atómicos
  el preflight, el `alter table` y los comentarios. `alter table … add column`
  con un valor por defecto constante no reescribe la tabla, pero pide un
  bloqueo `ACCESS EXCLUSIVE` breve (y comprueba los dos checks sobre las filas
  existentes, pocas). Si salta el `lock_timeout`, no se ha cambiado nada: se
  reintenta en otro momento. La cabecera del archivo («No aplicado en ningún
  entorno») es histórica y forma parte del SHA; el estado vigente es esta
  sección.
- **Rollback.** Apagar antes `ZALTYKO_CONNECT_ONBOARDING_ENABLED`. Borrar las
  columnas descarta el estado SEPA y de requisitos sincronizado; se recupera
  volviendo a leer las cuentas en Stripe. Válido mientras no exista la Fase 2:
  después, otras piezas leerán estas columnas.

  ```sql
  begin;
  set local lock_timeout = '5s';
  alter table zaltyko.organization_payment_provider_accounts
    drop column if exists sepa_debit_payments_capability_status,
    drop column if exists requirements_state;
  commit;
  ```

- **Requiere autorización de Elvis para aplicarse en producción.** Staging:
  aplicada el 16-11-2026 con su autorización. Producción: sin aplicar. La CI
  verde no equivale a autorización.

## Candidata de método de pago de la familia (cobro automático, Fase 2)

| Candidata | SHA-256 | Producción | Staging |
|---|---|---|---|
| `20261116180000_family_payment_methods_candidate.sql` | `72c7edcc74a84f78418fc4ea7ce207fed50795911f88f02f003d04b7fc40b572` | No aplicada | No aplicada |

**Estado: no aplicada en ningún entorno.** Staging y producción necesitan cada
uno una autorización expresa de Elvis; la de la Fase 1 no la cubre. Requiere
antes la candidata de la Fase 1 (`20261116120000_connect_onboarding_candidate.sql`).

La persona pagadora de una familia guarda una tarjeta o una domiciliación
bancaria en la cuenta Stripe conectada de su academia. Decisión:
`docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`.

- **Tabla nueva `zaltyko.family_payment_setup_attempts`.** Cada intento de
  guardar un método: Customer (`cus_…`) y preparación (`seti_…`) en la cuenta
  conectada, tipo (`card` o `sepa_debit`), persona pagadora y tutor, y la
  evidencia recortada del consentimiento (versión, fecha, IP `/24` o `/48`,
  agente hasta 120 caracteres y SHA-256 del texto aceptado). Estado `open`,
  `completed` (con su autorización, y solo entonces) o `abandoned`. Claves
  foráneas a pagador, tutor, cuenta conectada y autorización en `restrict`;
  la academia borra en cascada. RLS `ENABLE` y `FORCE`; solo `service_role`
  con `select`, `insert` y `update`, igual que `family_payment_authorizations`.
- **Columna nueva `family_payment_authorizations.payment_method_kind`**
  (`card` o `sepa_debit`, null en las filas existentes). Una autorización
  `active` exige el tipo, y una domiciliación `active` exige su
  `mandate_reference`. Cambia el comentario de la tabla: deja de ser «not
  operational».
- **Nunca** número de tarjeta, IBAN, marca, últimos dígitos, nombre del
  titular ni correo: esos datos los guarda Stripe.
- **Preflight.** Aborta si faltan las tablas canónicas o las dos columnas de la
  Fase 1, o si ya existen la tabla o la columna nuevas: reinstalar no toca nada.
- **Transacción propia.** A diferencia de la Fase 1, el archivo abre y cierra
  su transacción (`begin; … commit;`) con `set local lock_timeout = '5s'`: se
  ejecuta su texto exacto, sin envoltorio. Si salta el `lock_timeout`
  (`alter table` sobre `family_payment_authorizations` pide un bloqueo
  `ACCESS EXCLUSIVE` breve), no se ha cambiado nada y se reintenta en otro
  momento. Añadir la columna sin valor por defecto no reescribe la tabla; los
  checks nuevos se comprueban sobre sus filas (ninguna activa mientras la
  función no exista).
- **Espejo Drizzle.** La columna, en `src/db/schema/zaltyko-core.ts` (la tabla
  ya está en `supabase/migrations`). La tabla nueva, en
  `src/modules/family-payment-methods/infrastructure/family-payment-methods-schema.ts`,
  fuera de `src/db/schema/` como los demás candidatos (`validate:rls`). Hasta
  aplicarla, ningún código debe leer o insertar en `family_payment_authorizations`
  con Drizzle sin columnas explícitas.
- **Bandera** apagada por defecto: `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED`.
  Con ella apagada no se guarda ni cambia ningún método, pero quien ya tenía
  uno puede revocarlo (y la academia también). Mientras la tabla o la columna
  no existan,
  `isFamilyPaymentMethodsStorageAvailable()`
  (`src/modules/family-payment-methods/application/storage.ts`, solo lee
  `information_schema.columns`) devuelve `false` y la función responde «no
  disponible».
- **Derechos de datos.** La tabla nueva consta en el catálogo de
  `src/modules/data-rights/` como grupo opcional excluido
  (`OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES`, categoría
  `payment_authorizations`): solo el recuento de la academia, nunca sus
  valores, con la comprobación exacta de columnas. Todo o nada: sin la tabla, el
  paquete de exportación es idéntico al anterior; con una columna sin
  clasificar, la exportación falla cerrada. El plan de disposición la revisa
  igual (`REVIEWED_DISPOSITION_OPTIONAL_GROUPS`). No entra en la política de
  supresión de las funciones activadas: no es una función activada.
- **Borrado de la academia.** Como en `family_payment_authorizations`, las
  claves a pagador, tutor, cuenta conectada y autorización son `restrict`,
  y la academia borra en cascada. Con intentos guardados, borrar la academia
  podría fallar por esas claves antes de que la cascada llegue a los intentos.
  Ningún flujo de Zaltyko borra academias (se archivan) y el plan de
  disposición sigue bloqueado; revisarlo antes de cualquier borrado real.
- **Pruebas:** `tests/family-payment-methods-pg.test.ts`, en el job «Postgres
  integration». Instala la candidata (y antes la de la Fase 1 si falta) solo
  en el PostgreSQL desechable de GitHub y retira al terminar lo que instaló.
- **Rollback.** Apagar antes `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED` (revocar
  sigue funcionando con la bandera apagada). Después, **revocar y desligar en
  Stripe las autorizaciones activas antes de retirar** (desde `/owner/familias`
  o con el mismo servicio): sin la tabla y la columna nadie podría revocarlas
  desde Zaltyko y los métodos seguirían vivos en Stripe. Borrar
  la tabla descarta los intentos y su evidencia de consentimiento, y borrar la
  columna descarta el tipo de cada autorización: exportarlos antes si importan.
  Los checks nuevos se van con su columna. Si también hay que retirar la
  Fase 1, retirar antes esta: su preflight y su servicio leen las columnas de
  la Fase 1.

  ```sql
  begin;
  set local lock_timeout = '5s';
  drop table if exists zaltyko.family_payment_setup_attempts;
  alter table zaltyko.family_payment_authorizations
    drop column if exists payment_method_kind;
  comment on table zaltyko.family_payment_authorizations is
    'Reserved server-only model bound to one organization payment account and verifiable payer consent; not operational in this release.';
  commit;
  ```

- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.

## Candidata de cobro de cuotas (cobro automático, Fase 3)

| Candidata | SHA-256 | Producción | Staging |
|---|---|---|---|
| `20261117120000_family_collection_candidate.sql` | `1dcd25a875dc2400855c8e44beed1d99c9c9fdb352278cb11ec6a69d55d45050` | No aplicada | No aplicada |

**Estado: no aplicada en ningún entorno.** Staging y producción necesitan cada
uno una autorización expresa de Elvis; las de las Fases 1 y 2 no la cubren.
Requiere antes las candidatas de la Fase 1
(`20261116120000_connect_onboarding_candidate.sql`) y de la Fase 2
(`20261116180000_family_payment_methods_candidate.sql`).

Cada día se cobran las cuotas mensuales con la tarjeta o la domiciliación que la
familia guardó, en la cuenta Stripe conectada de su academia. Decisión:
`docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`; plan:
`docs/superpowers/plans/2026-11-16-cobro-automatico-fase3-cobro-de-cuotas.md`.

- **Tabla nueva `zaltyko.family_collection_attempts`.** Un intento de cobrar una
  factura mensual: `claimed` (reclamado, sin cobro en Stripe), `created` (con
  su `pi_…`), `processing`, `succeeded`, `failed` o `canceled`. Garantías en la
  base:
  - **un solo intento no terminal por factura** (índice único parcial
    `family_collection_attempts_open_uq` sobre `claimed`, `created` y
    `processing`), como mucho cinco intentos por factura
    (`unique (organization_id, invoice_id, attempt_number)`, número 1–5) y tres
    reanudaciones por intento;
  - el `pi_…` falta solo en `claimed` y en un `failed`/`canceled` que nunca
    llegó a Stripe (que entonces exige `failure_code` con el motivo); es único
    por academia;
  - `failure_code` y `decline_code` son solo códigos (minúsculas, dígitos y
    guion bajo, hasta 64) y solo en `failed` o `canceled`; `next_retry_at`,
    solo en `failed`;
  - `succeeded` exige el pago registrado (`payment_id`, único por academia) y
    el estado del reparto (`pending`, `allocated` o `needs_review`);
    `completed_at` existe exactamente en los estados terminales;
  - pagador, autorización, cuenta conectada y tipo de método son obligatorios
    salvo en `canceled`: la puerta escribe un `canceled` también cuando ya no
    hay pagador, autorización o cuenta, para que ninguna cuota quede sin
    intento terminal ni recordatorios;
  - importe positivo; la sede y la moneda deben ser las de la factura (claves
    foráneas compuestas). Todo intento es en `EUR` salvo un `canceled` sin
    cobro en Stripe, que puede llevar la moneda de una factura en otra moneda
    para que la puerta también la cierre y vuelva a manual.
  Claves foráneas a sede, factura, familia, pagador, autorización, cuenta
  conectada y pago en `restrict`; la academia borra en cascada.
- **Tabla nueva `zaltyko.family_collection_attempt_charges`.** Reparto del
  intento entre cuotas: clave `(attempt_id, charge_id)`, importe positivo; el
  intento borra en cascada y la cuota en `restrict`. Índice
  `(organization_id, charge_id)` para saber si una cuota tiene un cobro en curso.
- **Tabla nueva `zaltyko.organization_collection_settings`** (P2). Una fila por
  academia: `collection_day_of_month` null (día de vencimiento) o del 1 al 31;
  el ajuste al último día de los meses más cortos es lógica del dominio, no de
  la base. Sin fila = día de vencimiento. Versión optimista y miembro que lo
  cambió (`on delete set null (updated_by_member_id)`, PostgreSQL 15+).
- **No reutiliza `zaltyko.payment_attempts`:** exige `provider_attempt_id` antes
  de llamar a Stripe, no enlaza las cuotas y usa `sandbox|live` en vez del
  `test|live` de la cuenta conectada.
- **Nunca** mensajes de Stripe, número de tarjeta, IBAN, nombre ni correo.
  RLS `ENABLE` y `FORCE` en las tres; solo `service_role` con `select`,
  `insert` y `update`.
- **Preflight.** Aborta si la versión es anterior a PostgreSQL 15, si faltan
  las tablas canónicas, las dos columnas de la Fase 1 o los objetos de la
  Fase 2 (`family_payment_setup_attempts` y
  `family_payment_authorizations.payment_method_kind`), o si ya existe alguna
  de las tres tablas: reinstalar no toca nada.
- **Transacción propia** (`begin; … commit;`) con `set local lock_timeout =
  '5s'`: se ejecuta su texto exacto, sin envoltorio. No cambia tablas ni
  comentarios existentes.
- **Espejo Drizzle** en
  `src/modules/family-collection/infrastructure/family-collection-schema.ts`,
  fuera de `src/db/schema/` como los demás candidatos (`validate:rls`).
  `isFamilyCollectionStorageAvailable()`
  (`src/modules/family-collection/application/storage.ts`, solo lee el
  catálogo) exige las tres tablas con sus columnas, tipos y nulos exactos, el
  índice de un intento abierto por factura (único, válido, con sus columnas y
  su predicado) y los únicos de número de intento y de `pi_`; si no, el cobro
  no se ejecuta.
- **Bandera** apagada por defecto: `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED`.
- **Derechos de datos.** Las tres tablas forman un grupo opcional excluido
  (`OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES`): intentos y reparto en
  `payment_provider_attempts`, el día de cobro en
  `payment_provider_configuration`. Solo el recuento de la academia, nunca los
  valores, con la comprobación exacta de columnas. Todo o nada, porque la
  candidata las instala juntas: sin ellas el paquete es idéntico al anterior;
  con una sola o con una columna sin clasificar, la exportación falla cerrada.
  El plan de disposición las revisa igual (`REVIEWED_DISPOSITION_OPTIONAL_GROUPS`).
- **Borrado de la academia.** Como en la Fase 2, las claves en `restrict`
  pueden impedir borrar una academia con intentos antes de que llegue la
  cascada. Ningún flujo de Zaltyko borra academias (se archivan) y el plan de
  disposición sigue bloqueado.
- **Pruebas:** `tests/family-collection-pg.test.ts` (job «Postgres
  integration»: instala antes las Fases 1 y 2 si faltan, solo en el PostgreSQL
  desechable de GitHub, y retira al terminar lo que instaló y las filas de
  prueba, dejando el esquema igual, comprobado; las academias de prueba quedan
  vacías porque su historial de plan es solo de añadir) y `tests/family-collection-contract.test.ts` (candidata,
  espejo y detección de almacenamiento coinciden).
- **Rollback.** Apagar antes `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED` y
  esperar a que no quede ningún intento `claimed`, `created` ni `processing`
  (un cobro en curso en Stripe debe registrarse antes). Borrar las tablas
  descarta el historial de intentos y el día de cobro: exportarlos antes si
  importan; los pagos ya registrados siguen en `zaltyko.payments`. Retirar esta
  candidata antes que las de las Fases 2 y 1.

  ```sql
  begin;
  set local lock_timeout = '5s';
  drop table if exists zaltyko.family_collection_attempt_charges;
  drop table if exists zaltyko.family_collection_attempts;
  drop table if exists zaltyko.organization_collection_settings;
  commit;
  ```

- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en
  ningún entorno. La CI verde no equivale a autorización.

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
6. **Staging primero (desde el 12-11-2026).** Toda candidata nueva se instala
   y se prueba en staging (`docs/deployment/staging.md`) antes de pedir la
   autorización de producción. Toda candidata nueva requiere autorización de
   Elvis para aplicarse en producción; staging no la sustituye.
7. **Semillas de referencia.** Después de instalar esquema, comprobar que las
   tablas de referencia que la aplicación necesita tienen sus filas (como
   mínimo `zaltyko.owner_signup_consent_policy` con la versión vigente de los
   términos y `zaltyko.sport_profiles` de cada país con alta) y cargarlas si
   faltan. Ver `docs/qa/owner-signup-reference-seeds-incident-2026-11-12.md`.

La prueba de base desechable no acredita una instalación Supabase completa,
PostgREST, un usuario servidor productivo distinto, migración de datos legacy,
Stripe Live ni publicación del MVP. No contiene procedimientos de rollback
destructivo de datos. El ensayo natural de impago permanece independiente.

El bootstrap de CI es un superusuario distinto de `postgres`, para probar la
instalación trusted sin conceder SUPERUSER al propietario del candidato. No
se afirma equivalencia del propietario de cada objeto de extensión con el
bootstrap productivo. PostgreSQL ejecuta los scripts trusted como bootstrap,
aunque la extensión pertenezca al llamador: [documentación PostgreSQL17](https://www.postgresql.org/docs/17/sql-createextension.html).

## Candidata pendiente: retirar datos de salud del esquema legacy (14-11-2026)

`20261114120000_retire_legacy_health_data_candidate.sql` elimina
`public.athlete_documents`, `federative_licenses.medical_certificate_expiry` y
las dos columnas `medical_certificate_*` de `template_license_config`: datos que
solo usaba el panel `/app`, retirado en la rama `limpieza/retirar-app`. **No
aplicada en ningún entorno.** Es destructiva e irreversible; aborta salvo
`set local zaltyko.retire_health_data = 'confirmado'`. Los pasos previos (recuento,
borrado de Storage, cambios del esquema Drizzle) están en la cabecera del archivo.

**Paso obligatorio antes del `DROP`: respaldo cifrado de `athlete_documents`.** Quien autorice la
candidata debe exportar `public.athlete_documents` (filas) y los archivos de Storage del
prefijo `…/athletes/<id>/documents/` a un archivo **cifrado** (p. ej. `age`/GPG con clave
de Elvis), guardado fuera del repositorio y de iCloud, comprobar que se descifra y que el
recuento coincide, y anotar solo el recuento y la ubicación en el informe (nunca los datos).
Sin ese respaldo verificado no se aplica la candidata; si se decide que no hace falta
conservarlos, debe quedar escrito por Elvis.

## Comprobar los hashes

Antes de aplicar una candidata, comprueba que el SHA-256 del `.sql` coincide con el documentado aquí:

```bash
node scripts/candidates/verify-candidate-hashes.mjs
```

`OK`: el hash del archivo figura en este README. `FALTA EN README`: el archivo no coincide con ningún hash documentado; no aplicarlo sin revisar qué cambió. `HASH SIN ARCHIVO`: hash del README sin archivo correspondiente; solo avisa, porque aquí se conservan hashes históricos. El comando termina con código de salida 1 si hay algún `FALTA EN README`.
