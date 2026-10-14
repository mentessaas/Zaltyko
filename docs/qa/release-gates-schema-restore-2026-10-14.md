# Release gates: esquema remoto y recuperación — 14-10-2026

## Corte auditado

- **Base:** Main local `c86551be9a221b432cf2f42f00a3e6e757994a40`.
- **Rama de esta nota:** `codex/release-gates-audit-20261014`.
- **Alcance:** lectura de catálogos/versiones de Supabase, estado de PR/CI y
  documentación de cutover. No se leyeron filas de personas, no se imprimieron
  credenciales y no hubo escrituras remotas, migraciones ni despliegues.
- **No-go vigente:** los resultados locales no acreditan compatibilidad del
  destino, restauración ni publicación.

## Gates locales

- Chromium pasó en `0e145bb0a1a517b34535b64d533f31bcf9373357`: 1/1 en 41,8 s.
  El reporte de QA registra pago persistido, una línea para la gimnasta con dos
  clases, dos snapshots, dashboard, tamaños 375/768/1280 y negativos de
  academia/sede/rol; stack y volúmenes quedaron limpios.
- Firefox falló en el mismo SHA tras 20,7 s, con `NS_BINDING_ABORTED` al
  navegar a inscripciones pendientes (`tests/e2e-owner-local-setup.spec.ts`,
  línea 233). El runner confirmó cleanup. No alcanzó facturación ni dashboard.
  La causa no está establecida; no se autorizó reintento ni aumento de timeout.
- WebKit tiene stack local efímera y está compilando; el test de navegador aún
  no tiene resultado. QA informa que no hay otro navegador en ejecución. Hay que
  cerrar Firefox y completar WebKit antes de considerar cerrado el gate local.

Fuente del corte: [readiness E2E](monthly-billing-e2e-readiness-2026-10-14.md).

## Catálogo remoto y diferencias observadas

Consulta de solo lectura, 14-10-2026. Se consultaron versiones aplicadas y
metadatos de `information_schema`; no se consultaron filas de negocio.

| Proyecto | Ref | PostgreSQL | Última versión listada | Hallazgos de esquema |
| --- | --- | --- | --- | --- |
| Zaltyko | `jegxfahsvugilbthbked` | 17.6.1.038 | `20261005003634` | `information_schema.schemata` no devuelve `zaltyko`; existe `public.owner_consent`. |
| Zaltyko E2E Sandbox | `aeeootdmuiqkfeernskw` | 17.6.1.147 | `20261005002950` | Existe `zaltyko` y parte del dominio operativo; existe `zaltyko.family_collection_preferences` y `invoice_lines` legado. |

En el Sandbox no aparecen `price_plan_class_template_coverage`,
`invoice_line_enrollments` ni las tablas canónicas
`owner_signup_consent_policy`, `owner_signup_consents` y
`owner_signup_consent_audits`. La tabla `invoice_lines` no tiene las columnas
`location_id` ni `athlete_id` que añade la migración de facturación mensual.
En producción tampoco se encontró el esquema `zaltyko`. Esto deja sin demostrar
la compatibilidad del código candidato con ambos destinos.

`family_collection_preferences` existe en Sandbox, pero el catálogo de
migraciones no muestra la versión de repositorio
`20261013160000_canonical_family_collection_and_entitlements`; la equivalencia
de contenido/versión/hash queda **NO VERIFICADA**. No se inspeccionaron
políticas RLS ni grants remotos.

## Matriz de migraciones del repositorio

| Contrato | Migración local | Manifest del runner compartido | Evidencia remota |
| --- | --- | --- | --- |
| Dominio Owner canónico | 12 migraciones declaradas por `verify-zaltyko-cutover-boundary.ts` | Parte de `E2E_DOMAIN_MIGRATIONS` | Producción sin esquema `zaltyko`; Sandbox parcial y con versiones de repo no reconciliadas. |
| Consentimiento canónico de alta | `20261013235142_owner_signup_consent_canonical.sql` | Separada en `E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS`; no entra en la lista compartida | Las nuevas tablas no aparecen en producción ni Sandbox. `public.owner_consent` sigue existiendo; no se leyó su contenido ni hay prueba de backfill/equivalencia. |
| Cobertura de tarifa y snapshots mensuales | `20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql` | Separada en `E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS`; no entra en la lista compartida | Cobertura/snapshots y columnas nuevas ausentes en el Sandbox observado; producción sin esquema `zaltyko`. |

La separación del runner es intencional para impedir que migraciones locales
se apliquen implícitamente al Sandbox. No debe modificarse la allowlist para
resolver este gap. `verify-zaltyko-cutover-boundary.ts` también declara
`remoteReadiness: NO_VERIFICADO`; su PASS estático no prueba instalación remota.

## Compatibilidad, consentimiento y recuperación

- La migración de consentimiento crea almacenamiento canónico nuevo bajo
  `zaltyko`; el catálogo remoto muestra el almacenamiento legado
  `public.owner_consent`. No hay decisión aprobada de doble lectura, transición
  o mapeo, ni evidencia agregada de cuántos consentimientos habría que
  reconciliar. **No inventar backfill ni volver a otorgar consentimientos.**
- La migración mensual depende de tablas del ledger y agrega claves, columnas,
  cobertura efectiva e historial inmutable. Antes de activarla hay que demostrar
  que el target tiene las dependencias y policies/grants requeridos, en el
  orden exacto del bundle revisado.
- Las migraciones SQL delimitan transacciones, y los harness locales comprueban
  rollback de operaciones de aplicación. Eso no equivale a probar rollback de
  DDL desplegado ni recuperación desde backup. No se encontró un simulacro de
  restore para este esquema. RPO 24 h y RTO 8 h siguen como propuesta
  **NO VERIFICADA** en el [runbook](../runbooks/zaltyko-backup-restore.md).

## Propuesta de restore sintético local — no ejecutada

Cuando QA libere recursos y haya autorización para un runner local:

1. Crear dos bases efímeras locales; aplicar en una copia exacta y versionada
   de la allowlist local que contiene las dependencias, consentimiento y
   facturación. No leer `.env`, no usar datos remotos ni `auth.users` reales.
2. Sembrar solo IDs y datos sintéticos mínimos: organización, sede, perfil de
   consentimiento sintético, familia, una gimnasta, dos inscripciones y una
   tarifa que cubra ambas. Emitir una cuota sintética con una línea, dos
   snapshots y un pago manual; guardar conteos invariantes, versiones y
   checksum del dump local.
3. Restaurar el dump en la segunda base vacía. Comparar conteos e invariantes
   financieros; comprobar columnas/FK/constraints, políticas y grants, RLS,
   triggers inmutables, catálogo de migraciones y reconciliación del ledger.
4. Registrar tiempo de backup/restore y resultado; cerrar ambos entornos
   desechables y confirmar que no quedan procesos/volúmenes.

Esto probaría el flujo técnico en datos sintéticos locales; no demostraría
recuperabilidad de Preview/producción ni compatibilidad del target real. No se
ejecutó PostgreSQL por esta auditoría mientras QA mantiene el navegador activo.

## Secuencia de cierre propuesta — no ejecutada

1. Resolver Firefox solo con evidencia de traza/causa; después ejecutar WebKit
   de forma secuencial sobre el SHA aprobado y registrar cleanup.
2. Fijar el SHA candidato y el destino exacto. Capturar de nuevo catálogo,
   versiones, columnas, RLS y grants de forma read-only.
3. Acordar cómo preservar el consentimiento legado; revisar orden, checksums,
   dependencias y rollback de la migración completa sin cambiar allowlists.
4. Ejecutar primero el restore sintético local; después, si se autoriza aparte,
   un dry-run del ledger contra el destino elegido. No aplicar DDL en este paso.
5. Cerrar revisión independiente y checks CI/PR sobre el mismo SHA; mantener
   bloqueada la publicación hasta superar todos los gates anteriores.

## PR y CI observados

- **PR #225:** abierto, no borrador; `REVIEW_REQUIRED`, merge bloqueado y sin
  revisiones registradas. Los checks consultados pasan salvo Smoke Tests, E2E
  público y Lighthouse, que están omitidos. Head `f68ec68d`.
- **PR #226:** abierto como borrador; `REVIEW_REQUIRED`, merge bloqueado y sin
  revisiones registradas. Head `1182f0c6`, anterior al SHA local probado
  `0e145bb0`. El run `38491147838` tiene fallo en el E2E experimental local;
  build, autenticado, migraciones Drizzle, unitarias, RLS y tipos pasan, pero
  Smoke Tests, E2E público y Lighthouse están omitidos. El Preview de ese head
  no valida los cambios locales posteriores.

Estado final de esta auditoría: **NO-GO publicación / NO-GO piloto**. No hubo
operaciones remotas ni cambios de esquema. La decisión de no usar una rama
Supabase facturable permanece vigente.
