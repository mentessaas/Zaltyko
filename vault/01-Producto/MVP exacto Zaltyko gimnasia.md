---
status: draft
owner: producto
last_reviewed: 2026-06-23
source:
  - ../04-Marketing/Estrategia competitiva gimnasia.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ./Inventario de producto.md
  - ../07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md
---
# MVP exacto Zaltyko gimnasia

## Objetivo

Definir el alcance minimo vendible para academias de gimnasia artistica y ritmica en espanol. Este documento queda en borrador hasta completar investigacion competitiva, entrevistas, validacion de pricing y cierre de los bloqueos de portal/comunicacion detectados.

## Alcance prioritario

| Area | V1 vendible | No prioridad v1 |
| --- | --- | --- |
| Alumnos y familias | Alta, edicion, contactos, responsables, permisos basicos y vinculacion familiar. | Historial medico avanzado o documentacion compleja. |
| Clases y grupos | Horarios, niveles, modalidad, entrenador, cupos y asignacion de gimnastas. | Optimizacion automatica de horarios. |
| Pagos/cuotas | Cuotas basicas, estado de pago, recordatorios internos y vista por familia. | Facturacion electronica completa o contabilidad avanzada. |
| Asistencia | Pasar lista rapido por clase/grupo y alimentar reportes simples. | Analitica predictiva de abandono. |
| Progresion tecnica | Habilidades/evaluaciones por modalidad y aparato/categoria cuando aplique. | Resultados federativos automaticos completos. |
| Comunicacion interna | Mensajes, avisos, notificaciones e historial por alumno/familia/grupo dentro del SaaS. | WhatsApp como canal principal. |
| Portal de padres | Calendario, pagos, avisos, mensajes y progreso visible. | App nativa branded por academia. |
| Entrenadores | Asistencia, notas/progreso y mensajes internos desde flujo de clase. | Planificacion avanzada de entrenamientos. |

## Loop de producto

1. La academia crea clases/grupos y registra gimnastas.
2. Las familias reciben acceso al portal.
3. Padres revisan calendario, datos, pagos y avisos dentro de Zaltyko.
4. Entrenadores pasan asistencia y registran progreso.
5. Padres ven avances y mensajes en el portal.
6. La academia reduce trabajo manual y depende mas del sistema.

## Criterios de cierre

- Una academia puede operar una semana real con alumnos, familias, clases, pagos/cuotas, asistencia y comunicacion interna.
- Un entrenador puede pasar asistencia y registrar progreso sin salir del flujo de clase.
- Un padre puede ver calendario, pagos, avisos, mensajes y progreso desde un portal claro.
- El producto usa terminologia de gimnasia artistica/ritmica sin romper otros deportes existentes.
- Las promesas publicas quedan alineadas con [[Mensajes aprobados]] y [[Pricing]].

## Pendiente antes de cerrar alcance

- Completar [[Matriz competitiva gimnasia]].
- Hacer 10 entrevistas con academias.
- Definir limites freemium y primer upgrade pagado.
- Auditar rutas reales de portal de padres y comunicacion interna contra este MVP.

## Bloqueos detectados

- [[Auditoria MVP gimnasia - 2026-06-23]]: resolver acceso seguro a `/app/[academyId]/my-dashboard` para padres/atletas sin abrir rutas administrativas.
- Consolidar comunicacion interna como centro unico: mensajes, avisos, notificaciones e historial por gimnasta/familia/grupo.
- Validar una experiencia de entrenador en clase: asistencia + progreso + mensaje interno.
