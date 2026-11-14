# Matriz de retirada del owner heredado

## Hallazgos clave

1. Había tres superficies owner paralelas y un conjunto de APIs de dashboard
   que calculaban directamente desde `public.*`.
2. El dashboard de 30 widgets mezclaba plan comercial, actividad, operaciones,
   finanzas y analítica sin una frontera materializada reproducible.
3. `at-a-glance` contiene aprendizajes válidos: hora local IANA, fallo de fuente
   distinto de cero, prioridad antes que gráficos y destinos accionables.
4. Algunos contratos se comparten con coach y mobile; borrarlos ahora sería
   una regresión ajena al cutover owner.
5. Alertas legacy pueden transportar nombre de atleta. Esa práctica no pasa al
   Insights Engine agregado.

## Clasificación

| Elemento heredado                     | Decisión                        | Regla válida conservada                         | Siguiente paso                                           |
| ------------------------------------- | ------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `/app/:academyId/dashboard`           | **Retirado** (14-11-2026); `/app/**` redirige 308 a `/owner` | autorización server-side | hecho: ver `docs/qa/retiro-panel-app-2026-11-14.md` |
| `/dashboard/at-a-glance`              | Sustituido; redirige a `/owner` | zona horaria, fallo parcial, acción prioritaria | convertir necesidades restantes en reglas P0 agregadas   |
| `/dashboard/analytics`                | Sustituido; redirige a `#score` | tendencias con período explícito                | retirar al cerrar E2E canónico                           |
| `DashboardPage` + `lib/dashboard.ts`  | Cuarentena                      | no asumir que ausencia = cero                   | no añadir funciones; retirar tras eliminar API base      |
| `/api/dashboard/:academyId` y widgets | Cuarentena                      | límites de lectura y estados parciales          | consumidores nuevos deben usar `/api/v1/owner/dashboard` |
| `attention-bundle` owner              | Cuarentena compartida           | fecha local, fuentes disponibles, CTA           | coach/mobile siguen dependiendo; separar antes de borrar |
| `attention-bundle` coach              | Se conserva temporalmente       | mínima tarea diaria sin finanzas                | reemplazo fuera de PR-09                                 |
| cobros vencidos legacy                | No se reutiliza                 | distinguir obligación, pago y fallo             | derivar del ledger canónico                              |
| alertas con nombres de atletas        | Rechazado en Insights           | ninguna PII en prioridad agregada               | EIPD antes de riesgo individual                          |
| imports/evaluaciones en borrador      | Aprendizaje pendiente           | operaciones incompletas deben ser visibles      | modelar solo con fuente canónica futura                  |

## Evidencia

- `src/app/app/[academyId]/dashboard/page.tsx` consultaba `public.academies`,
  `memberships`, `profiles` y `getDashboardData`.
- `src/lib/dashboard/attention-bundle.ts` diferencia explícitamente fuente no
  disponible de resultado cero y resuelve fecha local de academia.
- `src/lib/dashboard/alerts.ts` construye alertas individuales con nombre de
  atleta para pagos/asistencia; no se traslada al read model owner canónico.

## Accionable

Sí. Ningún código nuevo de owner puede importar `@/db/schema`; el gate de
cutover comprueba que los módulos canónicos solo usen `@/db/zaltyko-schema`.

## Actualización 14-11-2026: retirada completa de `/app`

El árbol `src/app/app/**` (150 archivos de ruta) se eliminó entero, con los
componentes y APIs que solo él consumía. Todas sus URLs responden un redirect
permanente (308) desde `next.config.mjs` a `/owner`, `/owner/<módulo>` o
`/familia`; el mapa vive en `src/lib/launch/legacy-app-redirects.mjs`. El
`academyId` de la URL antigua no se reutiliza. Lo que queda y lo que no tuvo
equivalente está en `docs/qa/retiro-panel-app-2026-11-14.md`. Las filas de
cuarentena de arriba (`DashboardPage`, widgets, `attention-bundle` owner) quedan
cerradas salvo `attention-bundle`, que coach y móvil siguen usando.
