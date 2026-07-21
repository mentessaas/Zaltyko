# Roles y permisos

## Modelos coexistentes

| Capa | Valores | Uso |
|---|---|---|
| Perfil global | `super_admin`, `admin`, `owner`, `coach`, `athlete`, `parent`, `provider` | shell global, onboarding, casos especiales |
| Membership academia | `owner`, `coach`, `viewer` | pertenencia y resolución de tenant |
| Rol personalizado | `academyRoles` + `roleMembers` + enum de permisos | capacidades por módulo, herencia y overrides |
| Shell de producto | super-admin, global, academy, limited | navegación y superficies visibles |

## Matriz esperada vs. enforcement observado

| Rol | Pantallas esperadas | API esperada | Estado observado |
|---|---|---|---|
| `super_admin` | panel global | APIs super-admin | gate JWT verificado y regresión automatizada negativa/positiva |
| `owner` | toda su academia | todas las capacidades de su academia | ownership se comprueba y obtiene all permissions |
| `coach` | clases asignadas, asistencia, progreso, mensajes | solo recursos asignados/capacidades concedidas | baseline y recurso se comprueban en servidor |
| `parent` / membership `viewer` | my-dashboard, mensajes, notificaciones y sus hijos | familia/propio | scope familiar/propio comprobado; sin capacidades administrativas |
| `athlete` / `viewer` | portal limitado propio | datos propios | scope propio; sin scope financiero familiar |
| rol personalizado | módulos declarados | permiso requerido por route registry | grants activos/vigentes; herencia protegida contra ciclos |

## Hallazgos

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| ROLE-001 | `src/lib/authz.ts:275-293` | La capa personalizada se aplica solo si `roleId` existe; roles baseline no-owner pasan el gate. | Crítica | Coach, parent o athlete puede invocar APIs ocultas por navegación. | Crear matriz canónica baseline→permiso y aplicar `hasPermission` sin condición `roleId`. | Sol |
| ROLE-002 | `src/lib/product/roles.ts`; layouts | El control de navegación (`limited` y lista admin-only) no es una frontera de seguridad. | Alta | Ocultar links no evita BOLA/IDOR ni mutaciones manuales. | Vincular cada pantalla a la misma capability del route registry y testear 403 server-side. | Terra |
| ROLE-003 | tests de roles/API | Las pruebas actuales validan shell/navegación, pero no una matriz negativa exhaustiva para `parent`, `athlete`, `coach`, `owner`, `super_admin`. | Alta | Regresiones de privilegios sin detección. | Fixtures reales por rol; probar cada dominio sensible GET/POST/PATCH/DELETE y acceso cruzado de academia. | Sol |
| ROLE-004 | `memberships`, `roleMembers`, perfil | Tres fuentes de rol pueden divergir y no hay invariantes documentadas de precedencia. | Media | Acceso residual tras cambio/invitación o UI/API incoherentes. | Documentar precedencia y añadir reconciliación/constraints y tests de revocación/expiración. | Terra |

## Regla objetivo

La autorización debe ser: identidad verificada **y** membership/ownership vigente **y** academia perteneciente al tenant **y** permiso de operación **y**, cuando aplique, vínculo al recurso (hijo, atleta propio o clase asignada). Ninguna de esas condiciones puede depender únicamente del cliente.

## Estado Día 3

- ROLE-001: cerrado y revalidado. La matriz baseline/custom ya no depende de que exista `roleMembers`.
- ROLE-002: cerrado como frontera de seguridad. La API aplica capability y resource scope independientemente de la navegación; la UI no concede autorización.
- ROLE-003: cerrado en el alcance automatizado previo a Día 4. El harness histórico fue reparado e integrado: 86 archivos, 618/618 pruebas en el gate normal y de seguridad, sin suites Vitest excluidas ni tests críticos skipped.
- ROLE-004: parcial. La precedencia owner → custom activo/vigente → baseline → deny está implementada y probada; la asignación/revocación de `roleMembers` ya se hace en operaciones transaccionales de invitación/roles, pero falta un job de reconciliación para detectar filas huérfanas o expiradas históricas.

Ver matriz de roles, capabilities, consumidores y scopes en `API_AUTHORIZATION_MATRIX.md`.
