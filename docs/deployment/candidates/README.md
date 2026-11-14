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
- **Pendiente, en una PR propia.** Borrar una cuenta falla en cuanto la
  persona tiene autoría en la academia, o si invitó o aceptó una invitación.
  La ficha de una gimnasta que vino de una solicitud tampoco se puede borrar.
  Detalle y propuesta de seudonimización:
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

`20261114130000_habitual_use_candidate.sql` crea una relación nueva, `public.usage_events`, sin tocar filas ni tablas existentes: contadores de uso por academia, tipo de evento (`staff_visit`, `family_portal_view`), rol y día. Producto y flujo: `docs/producto/uso-habitual.md`.

- No guarda identificadores de persona, de cuenta, de gimnasta ni de menor, ni IP ni texto libre. Solo los eventos de familia llevan `actor_ref`: 16 hexadecimales de un HMAC que rota cada semana (para contar cuentas distintas sin reconocerlas).
- Esquema `public` (como `growth_events`): telemetría interna del producto. Enlaza con `zaltyko.organizations` con `ON DELETE CASCADE`, así que borrar la academia borra su uso. RLS `ENABLE` y `FORCE`, `REVOKE ALL` a `public`, `anon` y `authenticated`, sin políticas.
- Bandera apagada por defecto: `ZALTYKO_HABITUAL_USE_ENABLED` más `ZALTYKO_USAGE_METRICS_ENABLED`. Mientras la tabla no exista tal como la define el archivo no se registra nada y `/super-admin/uso` responde «no disponible». Los avisos por correo no la usan.
- El preflight aborta si `public.usage_events` ya existe o falta `zaltyko.organizations`.
- SHA-256: `be9d0c8015d423c0d20ea80bd5d5352b5341768299612f82a5ef6d0bd23405af`.
- Pruebas: `tests/habitual-use-routes-and-contract.test.ts` (columnas, RLS, ausencia de datos personales y hash) y `tests/habitual-use-pg.test.ts` en el job «Postgres integration», que instala el candidato solo en el PostgreSQL desechable de GitHub y retira la tabla al terminar.
- **Requiere autorización de Elvis para aplicarse.** No se ha aplicado en ningún entorno. La CI verde no equivale a autorización.

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
