---
status: active
owner: producto
last_reviewed: 2026-06-23
source:
  - ../01-Producto/MVP exacto Zaltyko gimnasia.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../../src/app/app/[academyId]/my-dashboard/page.tsx
  - ../../src/app/app/[academyId]/layout.tsx
  - ../../src/lib/product/roles.ts
  - ../../src/lib/navigation/registry.ts
---
# Auditoria MVP gimnasia - 2026-06-23

## Resumen

Zaltyko ya tiene muchas piezas del MVP de gimnasia: alumnos, grupos/clases, cuotas/cobros, asistencia, evaluaciones/progreso, mensajes, notificaciones e invitacion/onboarding de padres. El problema principal no es ausencia total de modulos, sino coherencia de experiencia: el portal de padres y la comunicacion interna existen de forma parcial, pero no estan todavia cerrados como flujo vendible y navegable.

## Estado contra MVP

| Area MVP | Estado observado | Lectura |
| --- | --- | --- |
| Alumnos y familias | Avanzado. Existen `athletes`, `guardians`, `guardianAthletes`, contactos familiares y vistas de atleta. | Base suficiente para MVP; falta revisar UX de alta familiar desde una academia real. |
| Clases y grupos | Avanzado. Rutas modernas de clases/grupos, sesiones, cupos y asistencia. | Core operativo fuerte. |
| Pagos/cuotas | Avanzado/parcial. Hay `charges`, `billingItems`, billing panel y widget de pagos en `my-dashboard`. | Suficiente para validar cuotas, pendiente checkout/precios/fees definitivos. |
| Asistencia | Avanzado/parcial. Ruta `/app/[academyId]/attendance`, API, reportes y widget personal. | Buena base; falta asegurar flujo rapido para entrenador en clase y vista padre. |
| Progresion tecnica | Parcial/avanzado. Evaluaciones, assessments, scores, reports y widgets personales. | Diferenciador real; falta paquetizar por modalidad/aparato y visibilidad padre. |
| Comunicacion interna | Parcial. Hay direct messages, notifications, announcements y preferences. | Falta consolidar centro interno por gimnasta/familia/grupo y separarlo de WhatsApp. |
| Portal de padres | Parcial con bloqueo probable. Existe `my-dashboard` para parent/athlete, onboarding e invitacion de padres. | P0: el layout moderno parece bloquear roles `parent`/`athlete` antes de llegar a `/app/[academyId]/my-dashboard`. |
| Entrenadores | Parcial/avanzado. Coach routes, attendance, classes y evaluations. | Falta vista de "clase de hoy" orientada a asistencia + progreso + mensaje interno a familias. |

## Hallazgos criticos

### P0 - Portal moderno de padres/atletas inaccesible o mal enrutable

`src/app/app/[academyId]/my-dashboard/page.tsx` permite roles `athlete` y `parent`, pero `src/app/app/[academyId]/layout.tsx` usa `canAccessAcademyWorkspace`. En `src/lib/product/roles.ts`, `athlete` y `parent` tienen `canAccessAcademyWorkspace: false`, y el layout redirige esos roles a `/dashboard/profile`.

Riesgo: el producto puede tener un portal de padres construido, pero no vendible ni accesible desde la experiencia moderna `/app/[academyId]`.

Criterio de solucion: permitir acceso a `/app/[academyId]/my-dashboard` para `parent` y `athlete` sin abrir rutas administrativas de academia. La solucion debe ser por allowlist de rutas limitadas o por shell separado, no por dar acceso completo al workspace.

Estado 2026-06-23: primera implementacion aplicada con allowlist de rutas limitadas (`my-dashboard`, `messages`, `notifications`), navegacion limitada y redirect moderno desde `resolveUserHome`. Tambien se limpiaron enlaces internos del panel personal que apuntaban a rutas administrativas y se retiro el CTA directo de WhatsApp. Tests en verde: `tests/product-roles-navigation.test.ts`, `tests/e2e-critical-flows.test.ts` y `pnpm typecheck`. Pendiente QA real con usuario parent/athlete.

### P0 - Comunicacion interna no esta definida como centro de producto

Hay APIs y UI para:

- Direct messages: `src/app/api/messages/*`, `src/components/messages/*`.
- Notifications: `src/app/api/notifications/*`, `src/components/notifications/*`.
- Announcements: `/app/[academyId]/announcements`.
- Contact messages: `src/app/api/contact-messages/*`.
- WhatsApp: componentes y feature flag apagado por defecto.

Riesgo: para el usuario se percibe como piezas sueltas, no como "historial interno de la academia".

Criterio de solucion: definir una experiencia unica de comunicacion interna con contexto de gimnasta/familia/grupo/clase, dejando WhatsApp fuera del pitch v1.

Estado 2026-06-23: `/app/[academyId]/messages` ya no expulsa a perfiles `parent`/`athlete` miembros de la academia. Para esos perfiles renderiza el centro de mensajes directos interno (`src/components/messages/MessagesPage`) con conversaciones de `/api/messages/conversations`; owners/admin conservan la bandeja de mensajes de contacto publicos salvo cuando entran a una conversacion interna concreta por `conversationId`. Tambien se agregaron dos disparadores reales: desde Contactos del detalle de atleta, el staff puede abrir/crear una conversacion interna con un tutor que ya tenga `profileId`; desde el detalle de grupo, el staff puede abrir/crear una conversacion con todos los tutores del grupo que tengan acceso al portal. Ambos flujos validan tenant y contexto. Tests en verde: `pnpm typecheck` y `pnpm vitest run tests/product-roles-navigation.test.ts tests/e2e-critical-flows.test.ts`. Pendiente: QA real con tutor invitado, mensaje por clase/sesion y vista unificada con announcements/notificaciones.

### P1 - Progresion tecnica necesita empaquetado de gimnasia

La base existe con assessments, scores, apparatus y sport config. Falta confirmar que la UX habla de artistica femenina, artistica masculina y ritmica de forma consistente para padres y entrenadores.

Criterio de solucion: una academia debe poder registrar progreso por aparato/modalidad y un padre debe entender el avance sin ver jerga tecnica excesiva.

### P1 - Entrenador necesita flujo de clase compacto

Hay rutas de coach, attendance, classes y evaluations. Falta validar una pantalla diaria para "pasar lista + registrar avance + avisar a familias" sin navegar por varios modulos.

Criterio de solucion: desde una clase de hoy, el entrenador puede completar asistencia, notas/progreso y comunicacion interna en menos de 3 minutos.

## Recomendacion de implementacion

1. Resolver acceso seguro a `my-dashboard` para padres/atletas.
2. Hacer auditoria visual/QA del panel personal con usuario parent real.
3. Consolidar navegacion limitada para padres: Mi panel, Mensajes, Notificaciones.
4. Consolidar navegacion limitada para atletas si aplica: Mi panel, Mensajes, Notificaciones.
5. Convertir comunicacion en una experiencia interna unica antes de cualquier trabajo de WhatsApp.
6. Cerrar el MVP de gimnasia alrededor de portal padres + entrenador + progreso tecnico.
