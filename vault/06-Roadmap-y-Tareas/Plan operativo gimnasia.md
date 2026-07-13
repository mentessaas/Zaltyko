---
status: active
owner: producto
last_reviewed: 2026-07-13
source:
  - ../04-Marketing/Estrategia competitiva gimnasia.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../01-Producto/MVP exacto Zaltyko gimnasia.md
  - ../07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md
---
# Plan operativo gimnasia

## Objetivo

Convertir Zaltyko en un producto real operable por academias de gimnasia artistica y ritmica en espanol, con roles aislados, comunicacion interna primero, portal familiar util y pricing v3.0 publicado.

## Estado de ejecucion

| Fase | Estado a 2026-07-13 | Evidencia |
| --- | --- | --- |
| Fase 1 | Software cerrado y desplegado | Portal limitado, enlaces seguros, scoping tenant/academia y contratos de navegación. QA parent real pendiente como validación humana. |
| Fase 2 | Software cerrado, listo para promoción | Aviso interno desde sesión, mensajes/notificaciones/preferencias conectados, WhatsApp fuera del flujo principal. |
| Fase 3 | Parcial | Acciones rápidas ya integradas en dashboard de entrenador; queda completar la vista operativa compacta y progreso por modalidad. |
| Fase 4 | Parcial/operativa | Pricing v3.0 y Stripe real activos; siguen pendientes 10 entrevistas de validación. |
| Fase 5 | Pendiente | No iniciar hasta consolidar Fase 3 y validación comercial de Fase 4. |

## Fase 1 - Desbloquear experiencia padre/atleta

Prioridad: P0.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Resolver acceso limitado a `my-dashboard`. | Padres/atletas entran al panel moderno sin acceso a administracion. | `/app/[academyId]/my-dashboard` carga para `parent` y `athlete`; `/app/[academyId]/athletes`, billing admin, settings y reports admin siguen bloqueados. |
| Navegacion limitada. | Padres ven Mi panel, Mensajes, Notificaciones; atletas igual si aplica. | Top nav/sidebar/mobile no muestran acciones admin como Nuevo atleta, Ajustes o Billing admin. |
| QA con usuario parent. | Evidencia real del portal. | Parent puede ver hijos, calendario, asistencia, pagos, progreso y mensajes internos. |
| Limpiar rutas legacy relacionadas. | Menos confusion de `/dashboard/profile`. | `resolveUserHome` y rutas de invitacion llevan al destino correcto. |

## Fase 2 - Comunicacion interna primero

Prioridad: P0/P1.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Unificar mensajes/notificaciones/anuncios. | Una experiencia interna comprensible. | Desde familia o entrenador se entiende donde leer mensajes, avisos y notificaciones. |
| Contexto por gimnasta/familia/grupo. | Historial util y trazable. | Un mensaje puede vincularse a alumno, familia, grupo, clase o billing cuando aplique. |
| Degradar WhatsApp en UX. | No compite con el canal interno. | WhatsApp queda oculto por feature flag o posicionado como futuro/secundario. |
| Preferencias simples. | Familias controlan avisos sin complejidad. | In-app principal; email/push como avisos para volver a Zaltyko. |

## Fase 3 - Flujo entrenador "clase de hoy"

Prioridad: P1.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Vista compacta de clase. | Entrenador opera sin saltar entre modulos. | Desde clase/sesion puede pasar asistencia, registrar nota/progreso y enviar aviso interno. |
| Progreso por modalidad/aparato. | Diferenciador de gimnasia visible. | Artistica/ritmica muestran etiquetas y aparatos correctos desde sport config. |
| Mensaje a familias desde clase. | Comunicacion contextual. | El aviso queda en historial interno y notifica a padres. |

## Fase 4 - Pricing v3.0 publicado y validacion post-lanzamiento

Prioridad: P1.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Mantener pricing v3.0 coherente. | Free/Starter/Growth/Network son la fuente oficial. | Catalogo, limites, copy publico, tests, [[Pricing]] y [[Mensajes aprobados]] dicen lo mismo. |
| Validar conversion con 10 academias. | Datos reales de disposicion de pago post-lanzamiento. | 10 entrevistas registradas con tamano, herramientas actuales, dolor, precio aceptable y objeciones; no bloquean v3.0. |
| Confirmar Stripe real. | Starter/Growth se pueden comprar sin placeholders. | Price IDs reales por entorno y checkout/webhook probados; Network sigue como CTA comercial hasta tener checkout dedicado. |

## Fase 5 - Landing/preventa gimnasia

Prioridad: P2 hasta cerrar fases 1-4.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Mensaje especifico gimnasia. | Oferta clara. | Landing o seccion beta habla de gimnasia artistica/ritmica, familias, cuotas, asistencia y progreso. |
| Lead magnet Excel. | Captura de academias pequenas. | Plantilla gratuita de alumnos/pagos/asistencia enlaza a waitlist/demo. |
| Lista de espera. | Validacion de demanda. | 50 leads cualificados o 5 academias beta interesadas. |

## Orden recomendado

1. Corregir acceso limitado a portal padres/atletas.
2. Probar portal con datos reales.
3. Consolidar comunicacion interna y ocultar WhatsApp del pitch.
4. Validar flujo entrenador en clase.
5. Medir conversion del pricing v3.0 y ajustar solo con nueva decision documentada.
6. Publicar landing/preventa enfocada en gimnasia.
