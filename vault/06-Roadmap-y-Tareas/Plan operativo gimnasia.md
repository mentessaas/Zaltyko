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
| Fase 2 | Software cerrado y desplegado | Aviso interno desde sesión, mensajes/notificaciones/preferencias conectados, WhatsApp fuera del flujo principal. |
| Fase 3 | Software cerrado y desplegado | Cockpit de sesión con asistencia, progreso por modalidad/aparato y aviso interno; permiso de coach, persistencia, WCAG y móvil verificados. |
| Fase 4 | Software de medición cerrado / validación 0/10 | Pricing v3.0 coherente, Stripe live verificado, funnel first-party, leads y cockpit de entrevistas operativos. La fase comercial no está cerrada hasta completar 10 entrevistas reales. |
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

### Evidencia de cierre Fase 3

- Ruta operativa: `/app/[academyId]/coach/today/[sessionId]`, accesible desde dashboard, acciones rápidas y vista diaria del entrenador.
- Asistencia masiva y excepciones persisten en la sesión; el coach solo puede leer/escribir clases asignadas.
- La evaluación rápida conserva `sessionId`, modalidad, aparato, comentario y `assessedBy` derivado de la identidad autenticada; el cliente no decide el coach.
- `sport-config` entrega terminología y aparatos correctos; el bloque paralelo de nomenclatura federativa `bd2bb95a` quedó integrado.
- Recorrido E2E real verificado y fixtures purgadas; Playwright autenticado 2/2 con WCAG 2.2 AA y viewport 375 px sin desbordamiento.
- Migración aditiva `20260713150000_link_assessments_to_class_sessions.sql` aplicada; no se ejecutó seed global.
- Deployment productivo `dpl_68XGuYVFtQnrLbjWjhv17NtMpxH8`, estado `READY` y alias `zaltyko.com`.

## Fase 4 - Pricing v3.0 publicado y validacion post-lanzamiento

Prioridad: P1.

| Tarea | Resultado esperado | Criterio de aceptacion |
| --- | --- | --- |
| Mantener pricing v3.0 coherente. | Free/Starter/Growth/Network son la fuente oficial. | Catalogo, limites, copy publico, tests, [[Pricing]] y [[Mensajes aprobados]] dicen lo mismo. |
| Validar conversion con 10 academias. | Datos reales de disposicion de pago post-lanzamiento. | 10 entrevistas registradas con tamano, herramientas actuales, dolor, precio aceptable y objeciones; no bloquean v3.0. |
| Confirmar Stripe real. | Starter/Growth se pueden comprar sin placeholders. | Price IDs reales por entorno y checkout/webhook probados; Network sigue como CTA comercial hasta tener checkout dedicado. |

### Evidencia técnica y baseline Fase 4

- Pricing v3.0 conserva Free 0 EUR/30, Starter 19 EUR/75, Growth 49 EUR/200 y Network 99 EUR sales-assisted. Los límites de grupos/clases proceden del catálogo canónico también en modales de billing.
- El entorno Vercel de producción usa Stripe live. Los Prices de Starter y Growth están activos, en EUR, intervalo mensual, importes 1.900/4.900 céntimos y productos activos; Network no entra en checkout.
- `growth_events` captura señales first-party sin PII desde pricing/contacto y eventos autenticados de trial, checkout y suscripción. Las métricas no calculan porcentajes cuando falta denominador.
- `leads` persiste contacto antes de intentar email. Sus antiguas policies globales se sustituyeron por acceso exclusivo de super-admin; la app server-side mantiene el flujo público controlado.
- `commercial_interviews` exige academia única y evidencia mínima para contar una entrevista como completada: tamaño, herramientas, dolor, objeción, precio fácil/límite y fecha.
- `/super-admin/growth` muestra funnel acumulado, tasas honestas, progreso 0/10 y formulario accesible. No se registraron entrevistas ficticias para QA.
- Baseline Supabase a 2026-07-13: 2 academias, 0 leads, 0 eventos de growth, 0 trials, 0 suscripciones Stripe-backed y 0 entrevistas.
- Migración aditiva `20260713170000_phase4_commercial_validation.sql` aplicada con rollback smoke; el cierre no destructivo `20260713173000_reconcile_coaches_slug_unique.sql` reconcilia el único drift detectado por Drizzle. Inventario: 6 Drizzle + 31 Supabase, RLS 65/65. No se ejecutó seed global.
- Gate: 279 APIs sin rutas riesgosas, 431/431 tests, build 216 páginas y axe WCAG 2.2 AA limpio en pricing, contacto Network y Growth.

### Cierre comercial pendiente

Fase 4 sigue activa. Deben realizarse y registrarse 10 entrevistas con academias distintas, sintetizar patrones por tamaño/modalidad y revisar la decisión de pricing solo con esa evidencia. Interés beta y disposición a pagar se observan; no se convierten en umbrales inventados antes de tener baseline. Fase 5 permanece bloqueada.

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
