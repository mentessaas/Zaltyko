---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - Inventario de producto
  - Auditoria de producto real
  - Estado actual de Zaltyko
---

# Auditoria de la vault - 2026-06-22

## Resumen ejecutivo

La vault es **operativa, coherente y bien conectada**. Tiene 51 notas `.md` distribuidas en 10 directorios, todos los wikilinks internos resuelven (0 enlaces rotos), el 86 % de las notas están marcadas como `status: active` y las 6 restantes son templates en `status: draft` (correcto). El frontmatter está estandarizado con `status`, `owner`, `last_reviewed` y `source`, lo que permite gobierno y trazabilidad.

## Estructura y volumen

| Directorio | Notas | Owner dominante | Rol |
| --- | ---: | --- | --- |
| `00-Inicio` | 5 | producto | Hub de entrada, glosario, workflow diario. |
| `01-Producto` | 8 | producto | Inventario, vision, modulos y tareas P1. |
| `02-Tecnologia` | 5 | tech | Arquitectura, patrones obligatorios y runbooks. |
| `03-Negocio` | 5 | negocio/tech/ventas | Pricing, ICP, modelo y tareas de checkout/downgrade. |
| `04-Marketing` | 7 | marketing/producto | Mensajes aprobados, buyer personas, metricas, CS. |
| `05-Ventas-y-CS` | 3 | ventas | Demo, objeciones, onboarding cliente. |
| `06-Roadmap-y-Tareas` | 4 | producto | Roadmap, backlog, decisiones, changelog. |
| `07-Auditorias-y-Riesgos` | 6 | producto/tech/marketing | QA, riesgos, SEO, go-live, auditoria producto. |
| `08-Referencias` | 2 | tech | Fuentes clave e indice legacy. |
| `99-Templates` | 6 | producto | Templates en `status: draft` (a proposito). |
| **Total** | **51** | | |

Distribucion por owner declarado:

- producto: 29
- tech: 9
- ventas: 5
- marketing: 5
- negocio: 3

## Notas mas referenciadas (grafo de entrada)

| Veces | Nota | Conclusion |
| ---: | --- | --- |
| 12 | [[Mensajes aprobados]] | Punto de control para todo copy publico. |
| 11 | [[Inventario de producto]] | Resumen ejecutivo de modulos y gaps. |
| 8 | [[Backlog priorizado]] | Estado vivo de tareas P0/P1/P2. |
| 8 | [[Pricing]] | Fuente unica comercial de planes. |
| 6 | [[QA - Flujos P1]] | Checklists operativos por flujo. |
| 6 | [[Decisiones]] | Registro historico de elecciones. |
| 5 | [[Arquitectura]] | Referencia para cambios tech. |
| 5 | [[Registro de riesgos]] | Tablero vivo de mitigaciones. |

## Salud de los wikilinks

- **Links rotos**: 0 de 108 enlaces analizados. La navegacion entre notas es 100 % integra.
- **Archivos sin enlaces entrantes (huerfanos)**: 8, todos legitimos:
  - 5 templates en `99-Templates/` (`Template - Auditoria`, `Template - Cambio de producto`, `Template - Decision`, `Template - Modulo`, `Template - Tarea`). Se referencian solo al crearse, no al estar disponibles.
  - `Modulo - Atletas` y `Modulo - Evaluaciones`: aparecen en [[Inventario de producto]] como link directo al nombre, no como wikilink con doble corchete; quedan navegables por el inventario y por el menu de Obsidian.
  - `Fuentes clave`: es un indice tecnico interno, no necesita entrada por wikilink.

## Cobertura por dominio

| Dominio | Cobertura | Notas relevantes |
| --- | --- | --- |
| Producto (modulos) | Alta | 3 modulos detallados + inventario + 4 tareas con QA. |
| Tecnologia | Alta | Stack, patrones obligatorios, 3 runbooks, fuentes. |
| Negocio | Alta | Pricing aterrizado, ICP, modelo, 2 tareas criticas. |
| Marketing | Media-alta | Mensajes aprobados, competidores, metricas, CS. |
| Ventas y CS | Media | Playbooks existen pero pocos y cortos; podrian ampliarse. |
| Roadmap | Alta | Roadmap por fases + backlog priorizado + decisiones. |
| Auditoria y riesgos | Alta | 6 notas cruzadas con el backlog. |
| Referencias | Suficiente | Indice legacy completo + fuentes clave. |

## Hallazgos de la auditoria

1. **Pricing esta aterrizado pero no congelado.** El [[Pricing]] confirma que los nombres publicos son Starter/Growth/Network, los codigos internos son `free/pro/premium` y el checkout activo rechaza planes sin `stripePriceId`. La UI mantiene el plan anual como "proximamente". Riesgo: si marketing lanza campana con descuento anual sin implementar price IDs anuales, se cae la promesa.
2. **Downgrade Stripe resuelto.** La [[Tarea - Corregir downgrade Stripe]] ya tiene helper `getPrimarySubscriptionItemId` en `src/lib/stripe/subscription-items.ts` y test vitest verde. El backlog lo marca `Resuelto`.
3. **Paginacion de notificaciones corregida.** [[Tarea - Consolidar comunicacion]] documento el fix `(pageToLoad - 1) * limit`. ESLint focal limpio.
4. **E2E autenticado funcionando.** [[QA - Flujos P1]] confirma que `pnpm test:e2e` pasa con 10 tests en Chromium contra academia demo real (owner, perfil, membresia, onboarding completado, atleta fixture). Storage state en `.auth/` ignorado por git. No se documentan secretos.
5. **Rutas legacy `/dashboard` conviven con `/app/[academyId]`.** Marcado como riesgo medio y aun no decidido. Antes de eliminar nada, [[Decisiones]] exige registrar eleccion.
6. **WhatsApp detras de feature flag.** [[Mensajes aprobados]] y [[Tarea - Consolidar comunicacion]] coinciden en no vender WhatsApp como activo si el flag esta apagado.
7. **Evaluaciones y asistencia en QA pendiente.** Ambos tienen checklist creado pero los E2E autenticados reales no se han corrido contra los flujos ([[Tarea - Validar evaluaciones end-to-end]], [[Tarea - Validar asistencia y reportes]]).
8. **Onboarding con base activa, faltan aha moments.** [[Tarea - Completar onboarding y aha moments]] tiene checklist pero queda ejecutar contra owner nuevo.
9. **Owner imbalance.** 29 de 51 notas declaran `owner: producto`, lo que concentra la responsabilidad. Tiene sentido porque producto cruza todos los frentes, pero bloquea si el owner no avanza.
10. **Ultima revision homogenea.** Todas las notas dicen `last_reviewed: 2026-06-22`. No hay notas claramente obsoletas por fecha, pero tampoco hay un schedule automatico de revision.

## Recomendaciones accionables

| Prioridad | Accion | Apunta a |
| --- | --- | --- |
| P0 | Decidir rutas legacy `/dashboard` y registrar en [[Decisiones]]. | Reducir ambiguedad tecnica. |
| P0 | Confirmar que la UI publica no ofrece compra anual sin price IDs anuales. | Evitar promesas rotas en [[Mensajes aprobados]]. |
| P1 | Correr E2E autenticado de evaluaciones, asistencia y onboarding contra academia demo. | Cerrar el bloque P1 del [[Backlog priorizado]]. |
| P1 | Instrumentar eventos de activacion y trial en producto. | Habilitar [[Metricas de marketing y producto]] con datos reales. |
| P2 | Distribuir ownership entre marketing y ventas para aligerar la carga del owner producto. | Mejorar cadencia de updates. |
| P2 | Ampliar [[Playbook de demo]] y [[Onboarding de cliente]] con casos concretos por segmento. | Mejorar conversion demo -> trial -> paid. |

## Conclusion

La vault cumple su proposito: ser una version navegable y viva de la verdad del proyecto. La disciplina de frontmatter, los wikilinks sin roturas y la trazabilidad cruzada (riesgos <-> backlog <-> tareas <-> QA) hacen que un agente o un humano nuevo pueda aterrizar en menos de una hora y encontrar que update antes de tocar codigo o copy. Los huecos principales son de **ejecucion de QA** (no de documentacion), y las decisiones pendientes estan correctamente marcadas en [[Decisiones]] y [[Registro de riesgos]].

## Como se actualizo esta auditoria

- Auditoria generada a partir de lectura completa de las 51 notas de la vault el 2026-06-22.
- Grafo de enlaces construido con `search_files` sobre `vault/` y verificado contra lista de archivos `.md`.
- Sin secretos, credenciales ni valores reales de entorno en esta nota.
