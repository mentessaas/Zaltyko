# Aceptación QA — acceso canónico de equipo, fase 1

## Corte y estado

- Checkout candidato: `Zaltyko-main-bridge-20261025`.
- Rama/HEAD revisados al iniciar: `codex/mvp-main-bridge-20261025` / `608a53bbe9939e93d759bca3d91d4279a10dd09c`.
- Contrato: `auditorias/2026-11-05/canonical-team-access-contract-next.md`.
- Estado: implementación canónica de fase 1 visible; revisión estática independiente cerrada apta para CI remota autorizada, sin P1/P2 de producto abiertos en los archivos revisados; **sin PASS de compilación, pruebas o runtime**. `.env.example` mantiene `ZALTYKO_TEAM_ACCESS_ENABLED=false`; esto no verifica la configuración de ningún entorno.
- No se ejecutaron tests, builds, servicios, navegador, SQL ni llamadas a proveedores. No se aplicó esquema ni se crearon identidades o invitaciones.

## Alcance

Esta fase cubre crear/listar invitaciones, reemitir, revocar, inspeccionar y aceptar. La gestión queda reservada a Owner activo con `locationScopeMode=all`; la invitación solo concede `manager` o `coach` con scope `selected` y sedes activas explícitas. No se habilitan roles ni acceso adicional.

Quedan fuera de esta fase el vínculo de perfil tras aceptación, la baja de un miembro ya activo, la asignación de Coach a sesiones, la asistencia y la aceptación de que el autoservicio de equipo esté completo. No se reutilizan `public.invitations` ni las rutas legacy `/api/invitations`.

## Rutas y criterios observables

| Método/ruta candidata | Criterio de aceptación |
|---|---|
| `GET /api/v1/owner/staff/access?organizationId=…` | Owner-all obtiene solo invitaciones y miembros de esa organización; puede ver el email de sus invitaciones para gestionarlas. La respuesta no contiene token, hash, URL ni Auth UUID. Manager, Owner-selected y organizaciones ajenas no obtienen datos. |
| `POST /api/v1/owner/staff/invitations` | Payload estricto, clave idempotente, email normalizado, rol `manager` o `coach` y una o más sedes activas, únicas y de la misma organización. Owner-all crea invitación pendiente; respuesta `private, no-store` revela el enlace solo en esa respuesta. No crea `auth.users`, membresía ni scopes y no envía correo. |
| `POST /api/v1/owner/staff/invitations/{id}/reissue` | Owner-all y `If-Match` actual rotan token/hash, renuevan TTL de 7 días e incrementan revisión. El token anterior deja de inspeccionarse. Replay con misma clave/payload no devuelve de nuevo el enlace; versión obsoleta o payload distinto da conflicto sin rotación. |
| `DELETE /api/v1/owner/staff/invitations/{id}` | Owner-all y revisión actual revocan solo una invitación pendiente, también si la expiración ya se deriva. El token deja de inspeccionarse. Aceptadas/revocadas dan conflicto; ninguna transición altera membresías o scopes ya existentes. |
| `POST /api/v1/staff/invitations/inspect` | Requiere sesión Auth y email confirmado que coincide tras normalizar. Es de solo lectura: muestra únicamente organización, rol y sedes solicitadas; no devuelve email, userId, token ni datos ajenos; no consume ni cambia la invitación. Token inválido, consumido, revocado, expirado o email distinto no permite enumeración. |
| `POST /api/v1/staff/invitations/accept` | Solo tras confirmación explícita en UI y con identidad/email confirmados. Deriva usuario y organización de sesión/invitación, nunca confía en `organizationId`, rol, scopes o `userId` del cliente. Crea en una transacción una membresía activa `manager|coach`, scope `selected`, todos los scopes pedidos y consume la invitación. Una membresía previa no se actualiza ni reactiva. |

Para requests válidos, la respuesta debe distinguir sin filtrar identidad: falta de sesión `401`; rol/Owner/scope no autorizado `403`; recurso no visible `404`; conflicto, replay con payload distinto, duplicado o transición inválida `409`; expiración al aceptar `410`; esquema/Auth no confiable `503` fail-closed. Invitación e inspección usan `Cache-Control: private, no-store`.

## Regresiones de seguridad que QA debe cubrir

- Matriz de permisos conductual por endpoint: Owner-all permitido; Owner-selected y Manager denegados; `admin`, `owner`, sedes inactivas/cruzadas, organización ajena y roles manipulados no amplían acceso.
- Normalización y unicidad: correo `trim().toLowerCase()`, roles limitados, sedes únicas/activas/de la organización; una pendiente duplicada, incluso expirada, produce conflicto sin crear ni rotar token.
- Reemisión/revocación/replay: revisión obsoleta no muta; clave repetida con mismo payload devuelve recibo seguro; clave reutilizada con otro payload no muta; create/list/retry nunca reemiten.
- Inspección y aceptación: identidad confirmada real derivada de Auth; mismatch y tokens inválidos/consumidos/revocados/expirados no enumeran cuentas; inspect no consume; accept requiere acción explícita; dos accept/revoke concurrentes dejan una sola transición ganadora.
- Atomicidad: antes/después de aceptación comparar invitación, membresía, `member_location_scopes`, auditoría y recibo; fallos de FK, sedes, último Owner, auditoría o esquema no dejan filas parciales. Lecturas, inspect y errores 410 no escriben.
- Minimización: token plano/hash y URL no aparecen en listados, inspect, logs, `audit_log`, recibos, outbox ni telemetría. Solo create/reissue inicial devuelve el token para construir el enlace volátil; los replays devuelven `token: null`. Owner-all puede ver emails de sus invitaciones, pero inspect no revela email ni Auth UUID. El archivo exportado excluye los valores de las tres tablas de acceso. No se despacha correo.
- Bootstrap: el token solo entra desde `#token=<43 base64url>`, se limpia URL antes de inicializar Sentry/telemetría y queda en memoria consumible una sola vez. No usar query/`next`, localStorage/sessionStorage ni persistencia para sobrevivir al login. Revisar por separado que una navegación SPA no entregue el fragmento a instrumentación.
- Feature gate y cierre: el flag de plantilla sigue desactivado; API/UI no presenta capacidad operativa mientras falte esquema canónico. Una dependencia ausente responde cerrado y no concede acceso.

## Diseño de la regresión fuente QA

`tests/team-access-security-contract.test.ts` importa y llama los seis handlers HTTP reales, usando requests/respuestas y sesión, scope, rate-limit y servicios sintéticos controlados. Conserva real el gate de aplicación, el guard HTTP y `requireOwnerAllScope`; comprueba códigos, cuerpos, cabeceras y que la denegación no llega al servicio. Un caso usa además la implementación real de creación con `db.transaction` simulado y falla en la primera proyección del esquema, antes de locks o escrituras. No inspecciona el código con grep ni duplica las pruebas PostgreSQL de Backend (`tests/canonical-team-access*.test.ts`). Las pruebas de bootstrap del fragmento de Root se revisan, no se duplican.

Estos mocks no acreditan RLS, locks SQL, atomicidad ni carreras. El test de organización ajena simula la denegación del resolver; no constituye una lectura real de dos tenants.

La verificación de carreras, locks, rollback SQL, RLS y snapshots PostgreSQL pertenece a la suite desechable de Backend. QA revisa su cobertura y la conexión del runner sin ejecutar SQL local ni afirmar que los tests HTTP con mocks prueban RLS.

## Hallazgos de integración en este corte

- Encontré rutas legacy basadas en `public.invitations`; no son el contrato canónico y no deben servir como sustituto.
- Los seis endpoints canónicos y el módulo `canonical-team-access.ts` ya están visibles. La revisión estática observa autorización Owner-all repetida después del lock de organización para mutaciones Owner, correo confirmado leído desde `auth.users`, sedes activas de la organización, ausencia de upsert de membresía y escritura conjunta de miembro/scopes/invitación/auditoría/recibo.
- El helper `src/lib/auth/team-invitation-fragment.ts` captura solo el fragmento exacto, limpia query/hash y entrega el token una sola vez desde memoria. `instrumentation-client.ts` omite `Sentry.init` en el documento `/staff/accept`, conserva `sentryPrivacyOptions` en los demás y descarta en el hook la transición cuyo destino sea `/staff/accept` antes de reenviarla a Sentry. No se afirma que un SDK ya inicializado o descargado quede desinicializado en una navegación SPA.
- La prueba fuente de Root simula el destino antes del cambio de `history`, comprueba que no se reenvía a Sentry ni se guarda el token en una navegación abortada. La página `src/app/staff/accept/TeamInvitationAcceptance.tsx` ya captura/limpia antes de su petición de inspección, conserva el token en ref volátil y exige clic explícito antes de aceptar. El enlace de login no incluye token, query de retorno ni fragmento.
- `middleware.ts` permite `/staff/accept` sin redirigir a Auth y añade `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store` y `X-Robots-Tag: noindex, nofollow, noarchive`; su prueba fuente comprueba esos headers.
- La aridad/tipos de `onRouterTransitionStart`, los imports y la compilación de las suites siguen pendientes del typecheck/CI remoto; esta lectura no los valida.
- Las tablas de invitaciones/recibos descritas por el contrato son candidatas y no aplicadas en este corte. La exportación existente seguirá siendo parcial, con extensiones opcionales all-or-none y contajes declarados; no se presenta como devolución integral ni contiene valores de token/email/Auth/recibos.

## Evidencia, importancia y siguiente paso

**Fuentes:** `auditorias/2026-11-05/canonical-team-access-contract-next.md`; `src/lib/auth/team-invitation-fragment.ts`; `instrumentation-client.ts`; `tests/team-invitation-fragment.test.ts`; `tests/invitation-security-contract.test.ts` y otras rutas legacy de invitación; `tests/canonical-team-access-pg.test.ts` cuando quede incorporada por Backend.

**Importancia:** alta. La transición entre invitación, identidad autenticada y scope por sede concede acceso operativo; un token, correo o scope cruzado no puede convertirse en acceso o filtración parcial.

**Siguiente paso:** integrar el diff final y ejecutar CI remota autorizada por Root. La suite PostgreSQL candidata ya tiene fuente para accept/revoke, accept/accept, rollback tardío de auditoría, snapshots de seis tablas y compatibilidad de export. Se corrigió una aserción de tabla exportada que usaba un prefijo ajeno al formato real. Toda prueba de esta tarea queda **NO EJECUTADA** hasta observar CI remota posterior a la integración. La revisión no autoriza SQL alojado ni publicación.

## Matriz de evidencia de esta implementación

| Área | Evidencia fuente preparada/revisada | Resultado observado |
|---|---|---|
| Guards HTTP, flag exacto y default-off, roles, strict body, If-Match, actor Auth, replay, errores privados | `tests/team-access-security-contract.test.ts` | FUENTE; NO EJECUTADA |
| Preflight canónico antes de locks/escrituras si falta esquema | Caso HTTP con servicio real y DB mock; `tests/canonical-team-access.test.ts` | FUENTE; NO EJECUTADA |
| Fragmento, limpieza, consumo único y hook SPA previo a history | `tests/team-invitation-fragment.test.ts` | FUENTE; NO EJECUTADA |
| UI sin autoaceptar, resultado incierto, no reenvío por recarga y enlace volátil | `tests/team-invitation-acceptance.test.tsx`, `tests/owner-team-access.test.tsx` | FUENTE; NO EJECUTADA |
| Export con tres exclusiones completas y contajes propios; discovery independiente; rechazo parcial | `tests/canonical-academy-data-export.test.ts`, `tests/canonical-academy-archive-verification.test.ts` | FUENTE; NO EJECUTADA |
| Carreras accept/revoke y accept/accept; rollback tardío de auditoría con snapshots exactos; unicidades, RLS, ausencia de leaks DB | `tests/canonical-team-access-pg.test.ts`, última fuente revisada | FUENTE; NO EJECUTADA |
| Typecheck, lint, unitarias, build y ejecución PostgreSQL desechable | CI remota posterior a integración | NO EJECUTADA en este informe |
| Sesiones reales, navegador autenticado, SQL alojado, correo y producción | Fuera del alcance autorizado de implementación | NO VERIFICADO |

Vault: Root coordina la nota final de integración; esta revisión no reescribe el historial ni las notas dirty de otros frentes.
