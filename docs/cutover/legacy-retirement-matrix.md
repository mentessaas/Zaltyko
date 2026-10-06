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
| `/app/:academyId/dashboard`           | Sustituido; redirige a `/owner` | autorización server-side                        | eliminar UI/lib cuando no tenga consumidores             |
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
