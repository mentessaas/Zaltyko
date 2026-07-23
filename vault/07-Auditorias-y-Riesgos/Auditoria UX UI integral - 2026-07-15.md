---
status: proposed
owner: producto/design/tech
last_reviewed: 2026-07-15
source:
  - ../../AGENTS.md
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ../00-Inicio/Estado actual de Zaltyko.md
  - ../01-Producto/Inventario de producto.md
  - ../../docs/design-system.md
  - ../../src/app/globals.css
  - ../../src/lib/navigation/registry.ts
  - ../../src/lib/product/roles.ts
  - ../../test-results/product-redesign-audit-2026-07-15/
---
# Auditoria UX UI integral - 2026-07-15

## Veredicto ejecutivo

Zaltyko no necesita una capa estética nueva: necesita consolidar su modelo de producto visible. La base técnica y de accesibilidad es mejor de lo que sugiere la inconsistencia visual, pero el frontend conserva varias generaciones de arquitectura, navegación y componentes. El riesgo principal no es el color morado: es que cada módulo siga expresando una lógica distinta.

La reconstrucción debe preservar los contratos funcionales y de permisos ya cerrados, especialmente:

- gimnasia artística y rítmica primero;
- terminología federativa y sport-aware;
- portal `parent`/`athlete` limitado a `my-dashboard`, `messages` y `notifications`;
- comunicación interna como registro principal;
- cockpit de sesión como contexto operativo del entrenador;
- checkout y administración de suscripción owner-only;
- rutas modernas bajo `/app/[academyId]/*` como destino del workspace.

No se modificó ningún componente ni ruta durante esta auditoría.

## Alcance y evidencia

- Inventario estático completo de `src/app`, `src/components`, tokens, navegación, roles, layouts y documentación.
- Aplicación local ejecutada con Next.js 15.5 en `http://127.0.0.1:3001`.
- Capturas actuales de home, login, registro y pricing en desktop y móvil bajo `test-results/product-redesign-audit-2026-07-15/`.
- Inspección DOM de jerarquía, etiquetas, nombres accesibles, idioma y overflow en superficies públicas.
- Revisión por contrato de las superficies privadas y de rol. No se reutilizaron archivos de sesión ni credenciales para evitar acceso o mutaciones no necesarias.
- Referencia adicional: los E2E existentes documentan 40/40 en el gate conjunto y el cockpit de coach pasó axe WCAG 2.2 AA y 375 px sin overflow. Eso demuestra bases sólidas, no coherencia UX global.
- Al abrir home/pricing, el comportamiento normal del frontend emitió dos `POST /api/growth/events` con respuesta 201. No se introdujeron datos de prueba manuales ni se intentó borrar telemetría; revisar el entorno de destino antes de usar estas visitas como evidencia comercial.

### Límites de evidencia

Las pantallas privadas no se consideran auditadas visualmente de extremo a extremo en esta pasada: se revisaron mediante código, contratos, componentes y evidencia E2E existente. Antes de implementar cada módulo será obligatorio capturar su estado autenticado real por rol, incluyendo datos, permisos, vacío, carga y error. No se afirma conformidad WCAG global.

## Inventario cuantitativo

| Área | Estado observado |
| --- | --- |
| Páginas App Router | 167 `page.tsx` |
| Layouts | 12 |
| Estados de carga | 30 |
| Error boundaries | 3 |
| Not found dedicados | 2 |
| Archivos de rutas/layout/estado inventariados | 212 |
| Primitivas en `components/ui` | 61 |
| Componentes bajo `components/dashboard` | 43 |
| Componentes bajo atletas / billing / clases / eventos | 29 / 28 / 19 / 20 |
| Componentes mayores de 500 líneas | 19 |
| Componente mayor | `SuperAdminUserDetail.tsx`, 1006 líneas |
| Tamaños de texto arbitrarios en TSX | 69 usos |
| Familias de rutas privadas | `/app/[academyId]/*`, `/dashboard/*`, `/super-admin/*` |

## Inventario de superficies

### Público y adquisición

- Home y clusters por locale/modalidad/país.
- Academias, eventos, coaches, marketplace y empleo.
- Producto, módulos, pricing, ayuda, docs, contacto, legal y estado.
- Login, registro, invitaciones y onboarding por tipo de cuenta.

### Workspace de academia

- Dashboard y analítica.
- Gimnastas: listado, alta, ficha, tutores, notas, documentos, historial, progreso y evaluación.
- Entrenadores: listado, ficha, configuración pública, panel propio y clase de hoy.
- Grupos, clases, recurrencia, calendario y asistencia.
- Cobros: cargos, campañas, descuentos, becas y recibos.
- Comunicación: mensajes, avisos, anuncios y hub `comms`.
- Eventos e invitaciones.
- Evaluaciones e informes.
- Ajustes, licencias, auditoría y soporte.

### Experiencias limitadas y globales

- Familia/gimnasta: `my-dashboard`, `messages`, `notifications`.
- Cuenta global/legacy: perfil, academias, calendario, clases, marketplace y empleo bajo `/dashboard/*`.
- Superadmin: dashboard, academias, usuarios, growth, logs y soporte.

## Mapa de roles y trabajo principal

| Rol | Trabajo principal | Información prioritaria | Debe quedar fuera |
| --- | --- | --- | --- |
| Propietario/director | Decidir y desbloquear la operación | atención hoy, cobros, impagos, ocupación, incidencias, crecimiento | métricas decorativas y detalle operativo sin acción |
| Administrador | Mantener la academia ordenada | tareas, altas/bajas, documentación, cuotas, horarios, comunicaciones | estrategia financiera si no tiene permiso |
| Entrenador | Ejecutar la sesión | clases de hoy, asistencia, observaciones, evaluación, aviso | finanzas y administración global |
| Padre/tutor | Resolver lo de sus hijos | próxima clase, avisos, pagos visibles, progreso, documentos, contacto | navegación del backoffice |
| Gimnasta | Entender su avance | objetivos, habilidades, logros y próximas actividades | control administrativo y métricas adultas |
| Superadministrador | Operar la plataforma | academias, usuarios, planes, salud, soporte, riesgo y auditoría | KPIs falsos o comerciales sin denominador real |
| Proveedor | Gestionar su presencia global | perfil, productos/servicios y vínculo con marketplace | workspace de academia salvo membresía explícita |

## Hallazgos priorizados

Escala: P0 bloquea la arquitectura; P1 afecta tareas centrales; P2 reduce coherencia o mantenibilidad; P3 es pulido.

| ID | Problema | Gravedad | Rol | Pantalla/sistema | Causa | Solución propuesta | Prioridad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Tres familias de rutas privadas expresan modelos de producto distintos | Crítica | Todos | `/app`, `/dashboard`, `/super-admin` | evolución acumulativa sin retirada de shell legacy | declarar autoridad por rol y convertir legacy en redirects/compatibilidad medida | P0 |
| UX-02 | El rol coach recibe el dashboard general en navegación, aunque existe panel y cockpit propios | Alta | Coach | registry, dashboard, `/coach` | navegación basada en módulos compartidos, no en trabajo | inicio del coach = “Hoy”; dashboard general solo si aporta tareas permitidas | P0 |
| UX-03 | Owner y admin comparten casi el mismo menú aunque sus decisiones y permisos difieren | Alta | Owner, admin | shell academia | rol efectivo reducido a navegación común | separar home, prioridades y acciones; mantener componentes compartidos debajo | P0 |
| UX-04 | Familia y gimnasta comparten una página con ramas y widgets, no dos experiencias diseñadas | Alta | Parent, athlete | `MyDashboardPage` | reutilización por condicionales dentro de 623 líneas | shell limitado común y composiciones específicas por rol | P1 |
| UX-05 | Registro ofrece proveedor junto a roles core de academia | Media | Alta pública | registro | modelo global expuesto antes de conocer intención | owner como camino principal; invitación/vínculo para coach/familia/gimnasta; proveedor secundario | P1 |
| UX-06 | Registro móvil empieza con vacío oscuro y contenido/logo parcialmente recortado | Alta | Alta móvil | `/auth/register` 375 px | composición desktop adaptada por overflow/altura | flujo móvil de una columna, header compacto y selector progresivo | P1 |
| UX-07 | La home móvil mide 12.796 px de alto | Media | Prospecto móvil | home | acumulación de secciones de adquisición sin priorización | reducir narrativa a prueba, valor, cómo funciona, pricing y confianza | P2 |
| UX-08 | La documentación visual describe morado + Inter, mientras el sistema activo usa teal/índigo + Space Grotesk | Alta | Equipo | docs/tokens | documento 1.0 obsoleto frente a Brand Book v1 | reemplazar por una única especificación versionada y trazable a tokens | P0 |
| UX-09 | `globals.css`, Tailwind y componentes permiten varias escalas de radio/sombra/color | Alta | Todos | foundations | compatibilidad histórica más utilidades de marca nuevas | tokens semánticos y lint visual gradual; deprecación explícita | P1 |
| UX-10 | 69 tamaños tipográficos arbitrarios y múltiples jerarquías locales | Media | Todos | TSX global | microajustes por componente | escala de tipo finita con roles semánticos | P2 |
| UX-11 | Colores de estado se codifican por pantalla con muchas familias (`red`, `amber`, `green`, `blue`, etc.) | Alta | Todos | alerts, badges, widgets | no existe contrato semántico único | tokens `status.*` con texto, icono y uso permitido | P1 |
| UX-12 | 43 componentes de dashboard favorecen un panel construido como colección de widgets | Alta | Owner/admin | dashboard | crecimiento por widget y KPI | reconstruir desde cola de atención, agenda y decisiones; retirar widgets sin tarea | P0 |
| UX-13 | Dashboard y portal calculan métricas localmente con jerarquías distintas | Alta | Owner, parent, athlete | dashboards | cada experiencia define sus propias cards | catálogo de información por rol, con pregunta, fuente, acción y estado vacío | P1 |
| UX-14 | Navegación de academia puede llegar a 15 entradas planas | Alta | Staff | sidebar | módulos al mismo nivel | agrupar por trabajo: Hoy, Personas, Operación, Finanzas, Comunicación, Analítica, Configuración | P0 |
| UX-15 | Búsqueda, CTA “Nuevo atleta” y Ajustes compiten antes del menú | Media | Staff | sidebar/topbar | shell suma accesos históricos | command/search global en topbar; una acción contextual por pantalla | P2 |
| UX-16 | Navegación móvil genera hasta 8 destinos del registry y reparte todos con el mismo peso | Crítica | Coach/staff | bottom nav | flag `mobile` por módulo, no límite de navegación | máximo 4 destinos + “Más”; coach con Hoy/Grupos/Mensajes/Perfil | P0 |
| UX-17 | La barra móvil desaparece al hacer scroll | Media | Móvil | `MobileAcademyNav` | optimización genérica de espacio | mantener navegación estable; ocultar solo acciones secundarias si hay evidencia | P2 |
| UX-18 | “Atletas”, “Gimnastas” y etiquetas sport-aware conviven según superficie | Alta | Todos | navegación/copy | terminología dinámica parcial y legado | glosario UI por contexto: comercial “gimnastas”; producto desde specialization | P1 |
| UX-19 | Hay superficies solapadas para comunicación: `comms`, `messages`, `notifications`, `announcements`, `whatsapp` | Alta | Todos | comunicación | módulos crecieron por canal | arquitectura por intención: Conversaciones, Avisos, Notificaciones; WhatsApp fuera de v1 | P0 |
| UX-20 | Asistencia tiene página general, hoy, sesión y cockpit del coach | Alta | Coach/admin | attendance/coach | flujos añadidos sin retirar entradas equivalentes | una entrada “Hoy”; historial/reporting como secundario | P1 |
| UX-21 | Cobros contiene muchas subrutas sin una cola única de atención | Alta | Owner/admin | billing | arquitectura por entidad | home de cobros: vencidos, fallidos, próximos y acciones; herramientas en navegación secundaria | P1 |
| UX-22 | Estados de carga existen en 30 de 167 páginas y errores dedicados solo en 3 | Alta | Todos | App Router | cobertura agregada módulo a módulo | contrato obligatorio de loading/empty/error/permission/offline para cada plantilla | P1 |
| UX-23 | Componentes muy grandes concentran presentación, datos y estados | Alta | Equipo | superadmin, settings, billing, dashboards | refactors funcionales sin frontera de composición | separar page model, secciones y patrones; evitar división puramente visual | P1 |
| UX-24 | Existen primitivas cercanas (`modal`, `dialog`, `confirm-dialog`, `alert-dialog`; selects múltiples) | Media | Equipo | `components/ui` | adopción incremental de shadcn y wrappers | matriz canónica/deprecada y migración por uso | P1 |
| UX-25 | Pricing carece de H1 en DOM | Media | Prospecto/a11y | `/pricing` | nivel visual y semántico desacoplados | un H1 por página y outline consistente | P1 |
| UX-26 | La comparación pública usa tabla extensa; su transformación móvil necesita validación | Media | Prospecto móvil | home | patrón desktop dentro de narrativa móvil | lista comparativa accesible por atributo o tabla con scroll anunciado | P2 |
| UX-27 | Los estados visuales documentados no cubren todas las variantes solicitadas | Alta | Equipo | design system | foundations y componentes descritos como ejemplos, no contratos | matriz default/hover/focus/active/disabled/loading/success/warning/error | P1 |
| UX-28 | El superadmin posee métricas reales pero un componente monolítico de 823 líneas | Alta | Superadmin | dashboard global | crecimiento de tabla, eventos y KPIs juntos | cockpit por riesgo/salud/soporte; drill-down a entidades | P1 |
| UX-29 | La experiencia del entrenador tiene un buen cockpit, pero la navegación no lo reconoce como centro | Alta | Coach | clase de hoy | feature nueva insertada en shell anterior | usar sesión como contexto principal y validar uso real en móvil | P0 |
| UX-30 | No existe una página fuente de verdad que conecte tokens, componentes, plantillas, roles y QA | Crítica | Equipo | documentación | archivos separados sin gobernanza | documentación viva + preview/Storybook o catálogo interno + checklist de adopción | P0 |

## Fortalezas a preservar

- Identidad pública actual más sobria, con navy, teal y buen contraste general.
- Login desktop comunica claramente la separación por roles.
- Labels de formulario asociados, `autocomplete`, `lang="es"`, alt de imágenes y targets mínimos de 44 px en las pantallas observadas.
- Primitivas ya disponibles para data table, combobox, date picker, file upload, empty/error states y mobile list.
- Terminología especializada y catálogo federativo ya integrados en módulos principales.
- Cockpit de sesión del coach, portal limitado y seguridad por rol tienen contratos recientes que no deben perderse.
- Métricas de superadmin y producto comercial evitan fabricar datos en la fase vigente.

## Ampliación: auditoría radical de paneles y menús por rol

### Evidencia autenticada

El 2026-07-15 se recorrieron sesiones QA locales autorizadas mediante navegador real:

- Owner: dashboard desktop/móvil, Gimnastas, Grupos y Planes/Cobros.
- Coach: panel personal desktop/móvil y navegación disponible.
- Superadmin: la sesión local y la de producción redirigieron a login; la inspección visual quedó bloqueada y se completó solo mediante el componente activo, navegación y contratos.
- Admin: no existe storage state dedicado; comparte shell y dashboard con owner según `roles.ts` y `registry.ts`.
- Parent/athlete: no existe storage state dedicado; se revisaron `MyDashboardPage`, widgets, rutas limitadas y contratos.

Evidencia aceptada bajo `output/playwright/role-audit/`. Las capturas del servidor previo en puerto 3000 con chunks 404 quedan rechazadas; la instancia limpia en puerto 3002 no presentó esos 404. En la instancia limpia sí apareció un hydration mismatch en el input de búsqueda del sidebar (`style={{}}` solo en SSR), que debe corregirse durante el trabajo de shell.

### Owner/director — diagnóstico

**Salud actual: baja para toma de decisiones; media como índice de módulos.**

El dashboard no responde primero a “¿qué requiere mi atención?”. En el primer viewport compiten:

- hero de bienvenida y CTA a clases;
- estado del plan SaaS;
- cuatro KPIs de inventario;
- recomendación de configuración;
- lista de recomendaciones;
- acciones rápidas;
- FAB adicional;
- contenido de próximos pasos debajo del fold.

Problemas específicos:

1. Gimnastas, entrenadoras y grupos son conteos, no decisiones.
2. El plan Free ocupa jerarquía superior a impagos, incidencias u ocupación.
3. “Recomendaciones”, “Acciones rápidas” y “Próximo paso” son tres modelos distintos de tareas.
4. El menú lateral tiene doce destinos planos y dos accesos a Ajustes.
5. “Nuevo atleta” aparece globalmente incluso cuando la pantalla no trata personas.
6. El FAB no explica su acción hasta interactuar y compite con CTAs contextuales.
7. En móvil, el dashboard conserva hero, plan y cards secuenciales; no existe resumen operativo específico.
8. La barra inferior owner tiene seis destinos, textos solapados y el FAB invade su área.

**Reemplazo propuesto:** cockpit de dirección con tres zonas:

1. `Atención`: impagos, grupos sin responsable, documentación, sesiones sin generar e incidencias.
2. `Hoy`: agenda, asistencia prevista/real y comunicaciones pendientes.
3. `Pulso`: cobrado del periodo, deuda, ocupación y altas/bajas; máximo cuatro indicadores con acción.

El plan SaaS pasa a avatar/menú de academia o banner solo cuando existe límite/bloqueo real.

### Administrador — diagnóstico

**Salud actual: baja por falta de identidad propia.**

El rol `admin` usa el mismo dashboard general y casi la misma navegación del owner. Esto produce dos riesgos:

- información estratégica o comercial sin tarea administrativa;
- ausencia de una cola diaria de altas, bajas, documentos, pagos manuales y cambios de horario.

**Reemplazo propuesto:** home `Tareas` con SLA/fecha, responsable, contexto y acción; resumen diario de sesiones y accesos rápidos a personas, cuotas y comunicaciones. Finanzas ejecutivas y plan SaaS quedan fuera salvo permiso explícito.

### Coach — diagnóstico

**Salud actual: media en intención; baja en priorización y móvil.**

Fortaleza: existe una propuesta concreta de “clase de hoy” y acciones de asistencia/evaluación. Problemas:

1. La ruta `/coach` no es el destino principal del menú; “Dashboard” apunta al panel general.
2. El menú permite `Nuevo atleta`, aunque no es una tarea universal de coach y puede exceder su responsabilidad.
3. Cuando no hay sesión, aparecen cuatro KPIs a cero, dos paneles vacíos y un horario vacío: comunica ausencia de datos, no qué hacer.
4. “Pasar lista” y “Nueva evaluación” siguen activos sin sesión asignada, creando rutas sin contexto.
5. La barra móvil muestra Dashboard, Gimnastas, Entrenamientos, Pasar lista y Mensajes con etiquetas solapadas.
6. Las cards métricas ocupan casi una pantalla cada una en móvil.
7. No existe destino “Hoy” en navegación, aunque es el modelo funcional más sólido del producto.

**Reemplazo propuesto:** home móvil `Hoy`:

- próxima sesión como objeto principal;
- CTA `Abrir clase`;
- progreso de sesión: asistencia, evaluaciones, aviso;
- después, agenda del día y cambios relevantes;
- vacío útil: “No tienes sesión hoy” + próxima sesión real, no KPIs a cero.

Desktop añade semana y grupos, pero conserva `Hoy` como prioridad.

### Parent/tutor — diagnóstico

**Salud actual: media en seguridad; baja como experiencia dedicada.**

El portal respeta el límite de rutas, lo cual debe preservarse. Sin embargo, `MyDashboardPage` compone alerta de pagos, selector de hijo, tres stats, horario, asistencia, pagos, progreso, evaluaciones y calendario como widgets. Esto vuelve a producir un dashboard generalista.

**Reemplazo propuesto:** home por hijo con:

- próxima clase y cualquier cambio;
- aviso pendiente;
- pago que requiere acción;
- último hito de progreso;
- contacto contextual con academia.

Calendario, pagos y progreso se abren como vistas simples dentro del portal limitado, nunca como rutas administrativas.

### Gimnasta — diagnóstico

**Salud actual: baja por reutilización del portal adulto.**

Comparte estructura y gran parte de los widgets con parent. Asistencia porcentual, pagos y calendario tienen más peso del necesario para una gimnasta.

**Reemplazo propuesto:** `Mi progreso` como inicio:

- objetivo actual;
- habilidades/aparatos en progreso;
- logro reciente;
- feedback de entrenadora;
- próximo entrenamiento o evento.

La edad debe condicionar copy, densidad y privacidad. No se gamificará con puntos inventados.

### Superadmin — diagnóstico

**Salud visual autenticada: pendiente; salud estructural: baja por sobrecarga.**

El componente activo tiene más de 800 líneas, diez cards métricas, varias gráficas, comparación, drill-down y tabla de actividad. Mezcla inventario, crecimiento, facturación y operación sin una jerarquía de riesgo.

**Reemplazo propuesto:** cockpit de plataforma:

1. `Requiere atención`: academias suspendidas/past due, errores operativos, soporte crítico y riesgos.
2. `Salud`: disponibilidad, procesos fallidos, webhooks y actividad anómala respaldada por datos.
3. `Negocio`: academias, trials y suscripciones con periodo/denominador.
4. `Actividad`: timeline filtrable y auditable.

Academias, usuarios, soporte y facturación mantienen vistas propias; el dashboard no intenta resumirlas todas con cards.

### Menú y shell nuevos

El shell actual se retirará conceptualmente, no se maquillará. La propuesta es:

- Topbar: contexto de academia/rol, búsqueda/comando, notificaciones y cuenta.
- Sidebar desktop agrupado, colapsable y con máximo 6 grupos funcionales.
- Navegación móvil con máximo 4 destinos y `Más`.
- Una sola acción primaria contextual por pantalla; sin CTA global “Nuevo atleta”.
- Sin FAB global en desktop ni sobre la barra móvil.
- Home por rol diferente, no mismo dashboard con cards filtradas.
- Breadcrumb solo donde ayude a profundidad; no decorar cada lista.
- Plan y configuración desde el contexto de academia, no como prioridad operativa permanente.

### Hallazgos adicionales de la ampliación

| ID | Problema | Gravedad | Rol | Evidencia | Solución | Prioridad |
| --- | --- | --- | --- | --- | --- | --- |
| UX-31 | Barra inferior owner muestra seis destinos y textos solapados | Crítica | Owner móvil | captura 375×812 | 4 destinos + Más | P0 |
| UX-32 | FAB invade navegación móvil | Alta | Owner móvil | captura 375×812 | eliminar FAB global | P0 |
| UX-33 | Cards KPI se convierten en bloques de pantalla completa | Alta | Owner/coach móvil | capturas 375×812 | resumen compacto y listas accionables | P0 |
| UX-34 | El plan SaaS precede problemas operativos | Alta | Owner | dashboard desktop/móvil | mover a contexto de cuenta/límite | P1 |
| UX-35 | Coach navega a Dashboard general en vez de Hoy | Crítica | Coach | registry + sesión | home y destino mobile `Hoy` | P0 |
| UX-36 | Coach ve CTA global Nuevo atleta | Alta | Coach | sidebar autenticado | acción por capability y contexto | P0 |
| UX-37 | Dashboard coach vacío acumula KPIs/paneles a cero | Alta | Coach | panel autenticado | próxima sesión/agenda y vacío orientado | P1 |
| UX-38 | Billing mezcla suscripción SaaS y cobros a familias | Alta | Owner/admin | tabs Planes/Cobros | separar `Plan Zaltyko` de `Cuotas` | P0 |
| UX-39 | Filtros de Gimnastas dominan el viewport | Alta | Staff | captura desktop | filter bar resumida + drawer avanzado | P1 |
| UX-40 | Una sola card de grupo queda aislada en lienzo amplio | Media | Staff | captura desktop | list/grid adaptativa y empty space útil | P2 |
| UX-41 | Admin carece de home propia | Crítica | Admin | roles/registry | dashboard de tareas operativas | P0 |
| UX-42 | Parent y athlete comparten dashboard condicional | Alta | Portal limitado | `MyDashboardPage` | composiciones separadas por rol | P0 |
| UX-43 | Superadmin intenta resumir todo con diez KPIs y gráficas | Alta | Superadmin | componente activo | cockpit por riesgo/salud/negocio | P0 |
| UX-44 | Hydration mismatch en búsqueda del sidebar | Media | Staff | consola instancia limpia | eliminar diferencia SSR/client | P1 |

### Criterio de radicalidad

El rediseño se considerará radical solo si cambia simultáneamente:

- qué pregunta responde cada home;
- qué destinos ve cada rol;
- el orden y peso de la información;
- los patrones desktop/móvil;
- la relación entre lista, detalle y acción;
- la arquitectura de componentes y tokens.

Cambiar colores, radios, tipografía o cards sin esos seis cambios no satisface el objetivo.

## Dirección de producto propuesta

### Principios

1. **La tarea antes que el módulo.** Cada pantalla responde a una pregunta operativa.
2. **Calma con precisión.** Pocas decisiones visibles, estado inequívoco, detalle bajo demanda.
3. **Gimnasia en el modelo, no como decoración.** Niveles, aparatos, ramas, sesiones y progreso son estructura; no se usarán siluetas o degradados temáticos sin función.
4. **Un shell por contexto.** Plataforma, academia y portal limitado; las variantes de rol cambian prioridades y navegación.
5. **Móvil es ejecución.** Coach y familia realizan tareas cortas con una mano; dirección analiza en desktop/tablet.
6. **Color semántico.** Teal para acción/identidad; índigo para profundidad; estados reservados; morado solo si sobrevive a la futura exploración visual.
7. **Densidad adaptativa.** Cómoda por defecto; compacta en tablas de staff; nunca compacta en tareas móviles críticas.
8. **Verdad operacional.** No se presenta ninguna métrica sin fuente, periodo, estado vacío y acción posible.

### Personalidad visual

- Profesional, serena y especializada.
- Superficies mayormente neutras; marca en navegación, foco y acciones.
- Tipografía de display solo para títulos breves; texto operativo con alta legibilidad.
- Iconos Lucide outline con grosor y tamaños fijados por token; sin mezclar packs.
- Bordes finos y elevación rara: nivel 0 por defecto, nivel 1 para interacción, nivel 2 para overlays.
- Motion de 120–220 ms para relación espacial y feedback; respetar `prefers-reduced-motion`.

## Arquitectura de navegación propuesta

### Owner/director

- Hoy
- Personas: Gimnastas, Familias, Entrenadores
- Operación: Grupos, Horarios, Asistencia, Eventos
- Finanzas: Cobros, Cuotas, Becas/Descuentos
- Comunicación
- Progreso: Seguimiento técnico, Evaluaciones
- Informes
- Configuración

### Administrador

- Tareas
- Personas
- Grupos y horarios
- Asistencia
- Cobros operativos
- Comunicación
- Eventos
- Documentación
- Configuración permitida

### Coach

- Hoy
- Mis grupos
- Gimnastas
- Mensajes
- Historial/Progreso
- Perfil

En móvil: `Hoy`, `Grupos`, `Mensajes`, `Perfil`; el resto desde contexto o “Más”.

### Parent

- Inicio
- Calendario
- Pagos
- Mensajes
- Perfil/familia

El acceso real seguirá limitado hasta que producto y permisos aprueben ampliar rutas. Pagos, calendario y progreso pueden ser secciones dentro de `my-dashboard`, no rutas administrativas.

### Athlete

- Mi progreso
- Próximo entrenamiento
- Objetivos/logros
- Avisos
- Perfil

### Superadmin

- Estado
- Academias
- Usuarios
- Planes y facturación
- Soporte
- Riesgos y auditoría
- Growth con evidencia
- Configuración

## Design System 2.0 propuesto

No debe implementarse hasta aprobar dirección visual mediante exploración de tres alternativas sobre pantallas reales.

### Foundations

- Tokens primitivos: escala neutral, marca, estados, tipografía, espacio, radio, borde, sombra, motion y breakpoints.
- Tokens semánticos: `surface`, `text`, `border`, `action`, `status`, `focus`, `data-viz`.
- Escala espacial base 4 con valores permitidos y densidad `comfortable/compact`.
- Tipo: display, page title, section title, body, label, caption y numeric.
- Grid: 4 columnas móvil, 8 tablet, 12 desktop; contenido con anchos por plantilla.
- Breakpoints definidos por comportamiento, no por dispositivo nominal.

### Componentes y patrones

- Consolidar Button, Field, Select/Combobox, DatePicker, Tabs, Badge, Tooltip, Menu, Card/Panel, Table, List, Dialog/Drawer, Alert/Toast, Empty/Error/Loading, Breadcrumb, Pagination y FilterBar.
- Añadir contratos de PageHeader, AttentionQueue, TodayTimeline, EntityHeader, DetailTabs, Metric, MobileActionBar, CommandPalette y QuickCreate.
- Tabla desktop con densidad y columnas configurables; mobile list con resumen y acción primaria.
- Formularios por secciones, guardado explícito, errores junto al campo y resumen de error cuando proceda.
- Cards solo para agrupar una entidad o decisión; no como contenedor universal.
- Gráficos solo cuando la tendencia o comparación supera lo que una cifra y texto pueden explicar.

### Estados obligatorios

Cada componente/plantilla documentará y probará: default, hover, focus-visible, active/selected, disabled, loading, success, warning, error, empty, permission denied y offline cuando aplique.

## Sistema de layouts

| Plantilla | Uso | Estructura |
| --- | --- | --- |
| Attention home | Owner/admin/superadmin | contexto del día, cola priorizada, agenda, resumen secundario |
| Work queue | cobros, tareas, soporte | filtros persistentes, lista/tabla, bulk actions, detail drawer |
| Entity list | gimnastas, familias, grupos | búsqueda, filtros, vista desktop/móvil y alta contextual |
| Entity detail | gimnasta, grupo, academia | header, estado, acciones, tabs y timeline |
| Session workspace | coach/asistencia/evaluación | contexto fijo, progreso de tarea, contenido por paso, action bar móvil |
| Calendar | staff/familia | agenda como default móvil, semana/mes en pantallas mayores |
| Settings | configuración | navegación local, formularios cortos, guardado y auditabilidad |
| Limited portal | parent/athlete | navegación mínima, lenguaje directo y una tarea dominante |

## Plan de migración

### Gate 0 — Validación de dirección

- Capturar todas las rutas core autenticadas por rol en desktop y móvil.
- Medir rutas legacy realmente usadas.
- Aprobar mapa de navegación, glosario, principios y tres exploraciones visuales.
- Congelar nuevos patrones visuales salvo P0 funcional.

### Fase 1 — Foundations y shell

- Design tokens semánticos, tipografía, iconos, estados y motion.
- Catálogo de componentes canónicos/deprecados.
- Shell academia por rol, navegación móvil y command/search.
- Sin rediseñar aún módulos completos.

### Fase 2 — Flujos de activación y trabajo diario

- Login, registro y onboarding owner/invitado.
- Dashboard owner y tareas admin.
- Coach Hoy + cockpit de sesión + asistencia móvil.

### Fase 3 — Personas y operación

- Gimnastas, familias, grupos, clases y calendario.
- Fichas y flujos de alta/edición.

### Fase 4 — Dinero y comunicación

- Cobros/cuotas y estados financieros.
- Conversaciones, avisos y notificaciones.

### Fase 5 — Diferenciación vertical y portales

- Seguimiento técnico, evaluaciones y progreso.
- Portal parent y experiencia athlete separadas.

### Fase 6 — Configuración, informes y plataforma

- Settings, reportes y superadmin.
- Retirada o redirect de rutas legacy con telemetría.

### Estrategia técnica

- Migración vertical por plantilla y flujo, no “big bang”.
- Adaptadores sobre APIs existentes; no cambiar contratos backend sin necesidad demostrada.
- Feature flag por shell o módulo si se necesita convivencia temporal.
- Componentes antiguos marcados `deprecated` y retirados cuando su último consumidor migre.
- Un PR/commit por unidad coherente y reversible; capturas antes/después y checklist de permisos.

## Riesgos técnicos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Romper permisos al unificar navegación | Crítico | tests por rol + mantener `roles.ts` como autoridad |
| Duplicar dos sistemas durante meses | Alto | fecha de retirada y owners por componente/shell |
| Reescribir backend por conveniencia visual | Alto | view models/adapters en frontend |
| Rediseñar sin sesiones reales de parent/athlete | Alto | gate de QA humana antes de ampliar portal |
| Perder terminología federativa | Alto | tests de labels por especialización y país |
| Regresión mobile en coach | Crítico | 375/390/768 px, una mano y sesión real por cada entrega |
| Métricas sin datos o periodo | Alto | contrato de métrica y empty state obligatorio |
| Scope inabarcable | Alto | orden por tareas core, no por cobertura de rutas |
| Rendimiento por shells y drawers complejos | Medio | budgets de JS/render y profiling por módulo |
| Accesibilidad degradada por componentes custom | Alto | Radix/native primero, axe + teclado + VoiceOver manual |

## Criterios de aceptación pre-implementación

- [ ] Inventario de rutas clasificado como canónica, compatibilidad, redirect o retirada.
- [ ] Inicio, navegación y permisos aprobados para cada rol.
- [ ] Tres direcciones visuales evaluadas sobre owner dashboard, coach móvil y parent móvil.
- [ ] Una dirección elegida con tokens preliminares y rationale.
- [ ] Matriz de componentes canónicos/deprecados aprobada.
- [ ] Glosario sport-aware y microcopy aprobado.
- [ ] Métricas de éxito y eventos de telemetría definidos sin datos inventados.
- [ ] Plan de capturas autenticadas y cuentas QA por rol listo.
- [ ] Estrategia de rutas legacy decidida.
- [ ] Riesgos de permisos, datos, performance y accesibilidad asignados.

## Criterios de aceptación por módulo implementado

- La tarea principal se identifica en menos de 5 segundos y tiene una acción dominante.
- No hay navegación o acciones que el rol no pueda ejecutar.
- Desktop, tablet y móvil tienen composición deliberada; las tablas se transforman en móvil.
- Estados loading, empty, error, success, permission y datos parciales están diseñados.
- Teclado completo, foco visible/no oculto, labels, anuncios de error y contraste WCAG 2.2 AA.
- 200% zoom sin pérdida de tarea; targets mínimos 24 px y 44 px para acciones móviles críticas.
- No hay overflow, texto cortado, consola con errores ni métricas hardcodeadas.
- Comparativa visual antes/después contra el sistema aprobado.
- Tests de permisos, rutas y contratos existentes siguen verdes.
- Vault, catálogo de componentes y deuda residual quedan actualizados.

## Prioridad recomendada

1. P0: autoridad de rutas/shell, navegación por rol y dirección visual.
2. P0: owner attention dashboard, coach Hoy y navegación móvil.
3. P1: foundations, componentes canónicos y estados transversales.
4. P1: personas/grupos/calendario/asistencia.
5. P1: cobros y comunicación.
6. P1: parent/athlete y progreso técnico.
7. P2: settings, reports, superadmin y retirada final de legacy.

## Estado de implementación

El usuario autorizó iniciar la reconstrucción integral después de la auditoría y pidió una dirección unificada con gráficos modernos/interactivos, tipografía legible y UX/UI deliberada. La primera capa aplicada mantiene contratos y permisos: canvas/tokens base, shell de academia, navegación móvil, dashboard de dirección con `OperationsPulse` basado en datos reales y dashboard de entrenador. La segunda capa incorpora alumnos, grupos, asistencia, cobros y mensajes; la tercera aplica la misma jerarquía al portal familia/gimnasta y al superadmin; la cuarta cubre calendario/clases, eventos, reportes y ajustes, incluyendo transformación mobile-first de la grilla de calendario y eliminación de ceros sin fuente. La implementación continúa por módulos y roles; no se considera cierre de rediseño hasta completar los criterios anteriores y la QA comparativa.

### Evidencia QA posterior a la implementación (15/07/2026)

- Instancia limpia: `http://127.0.0.1:3005`.
- Storage state vigente: propietario (`.auth/user.json`); coach disponible para la siguiente pasada. Parent/athlete y superadmin no cuentan con sesiones vigentes.
- Dashboard de propietario revisado en 1280×800 y 390×844: shell, hero, KPI, `OperationsPulse`, CTA, navegación móvil y FAB sin overflow ni errores de consola.
- Gimnastas y Entrenamientos revisados con el mismo state; se confirmó la transformación de tabla a fichas/lista en móvil y la grilla de calendario reservada para escritorio.
- Hallazgo corregido durante QA: pluralización española defectuosa en etiquetas dinámicas (`Sesiónes`, `Entrenadoraes`). Se centralizó la regla `-ión → -iones` y se revisaron breadcrumbs que aún apuntaban a `/dashboard` legacy.
- Artefactos: `.playwright-cli/page-2026-07-15T19-59-58-814Z.png` (desktop dashboard), `.playwright-cli/page-2026-07-15T20-00-05-518Z.png` (móvil dashboard), snapshots de navegación en `.playwright-cli/`.

### Evidencia QA de entrenadora (15/07/2026)

- Storage state `.auth/coach.json`, instancia local `http://127.0.0.1:3006`.
- `/app/[academyId]/coach` revisado en desktop y 390×844: hero de jornada, CTA de asistencia/evaluación, estado vacío y navegación móvil sin overflow ni errores de consola.
- Se reprodujo el defecto de inicio: `/app` enviaba a `/dashboard` y terminaba en Gimnastas. Se corrigió la resolución de home y el enlace Dashboard para apuntar al cockpit coach.
- Se verificó que el sidebar coach ya no muestra `Nuevo atleta`, Cobros, Ajustes ni gestión de equipo; conserva Gimnastas, Grupos, Entrenamientos, Pasar lista, Evaluaciones y Mensajes.
- Se verificó por test unitario la navegación coach y por browser que `/app` termina en `/app/[academyId]/coach`.
- La redirección de la ruta Cobros para coach se alineó con el mismo cockpit seguro; no se ampliaron permisos ni se modificaron contratos de datos.

### Super Admin: revisión estática y bloqueo de QA autenticada (15/07/2026)

- La arquitectura del panel conserva cinco KPIs principales, una banda secundaria compacta, gráficos con drill-down, estados vacíos explícitos y navegación global responsive mediante el drawer de `GlobalTopNav`.
- Se retiró un control de rango temporal que no modificaba los datos y se eliminaron tendencias `0%` sin periodo de comparación; los roles del gráfico ahora se presentan con copy humano.
- La QA visual en navegador queda bloqueada temporalmente: `.auth/super-admin.json` devuelve `refresh_token_already_used` y el Mac se encuentra bloqueado. El desbloqueo manual o una nueva sesión QA es requisito externo.

### Portal parent/athlete: continuidad de implementación (15/07/2026)

- Se añadió una superficie de “Próximas clases” como primera respuesta del portal, alimentada por las sesiones reales ya consultadas por el servidor y con estado vacío explícito.
- El selector familiar ahora respeta y sincroniza `athleteId` en la URL, evitando que una recarga vuelva silenciosamente al primer hijo cuando el tutor está revisando otro perfil.
- Se eliminó el riesgo de presentar asistencia `0%` sin registros: el resumen usa `—` y explica la ausencia de datos. El mismo contrato se aplica al widget de progreso.
- Los CTA y el widget de pagos solo se renderizan para tutores; la experiencia de gimnasta queda centrada en agenda, asistencia, progreso, evaluaciones y mensajes.
- Validación automatizada: `tests/phase2-role-communication.test.tsx` 4/4, `tests/product-roles-navigation.test.ts` 9/9, TypeScript, lint y build de producción de 219 rutas limpios.
- Sigue pendiente la evidencia visual autenticada con cuentas parent/athlete reales; no hay storage states vigentes y no se fabricaron datos.

### Super Admin: estados de datos y QA reintentada (15/07/2026)

- Se retiró la comparación demo sin backend real y se bloquearon los desgloses de gráficos cuando las series están vacías; el panel deja de tratar un placeholder como una métrica.
- La variación de crecimiento ahora distingue entre ausencia de serie y ausencia de cambio (`Sin serie disponible` / `Sin variación`).
- La sesión `.auth/super-admin-prod.json` volvió a fallar en una instancia limpia con `refresh_token_not_found` y redirección a login. Firefox/WebKit no están disponibles en el entorno; Chromium sí confirmó el bloqueo de autenticación.

### Owner: pulso operativo sin métricas ficticias (15/07/2026)

- El gráfico interactivo del dashboard de dirección distinguía mal entre “cargando”, “sin serie” y “sin cambio”, mostrando ceros por defecto. Ahora el estado es explícito y solo compara dos puntos reales.
- La corrección mantiene el endpoint `/api/dashboard/kpi-trends` sin cambios y evita presentar una cifra como real antes de recibir datos.

### QA autenticada final: parent, athlete y superadmin (15/07/2026)

- Se generaron sesiones E2E locales válidas para los tres roles a través del flujo de provisioning aprobado; los estados no contienen credenciales en documentación ni se consideran datos de producción.
- Parent y athlete acceden correctamente a `/app/[academyId]/my-dashboard`, `/messages` y `/notifications` con navegación limitada al workspace autorizado. Superadmin accede a `/super-admin/dashboard`, `/academies` y `/users`.
- La prueba descubrió un fallo de integración de despliegue: el middleware estaba fuera de `src/` y por tanto no aparecía en `middleware-manifest.json`. Se añadió el entrypoint `src/middleware.ts`, se mantuvo una única implementación y se verificó el gate en build de producción.
- El middleware ahora decodifica el envelope de sesión SSR de Supabase y valida superadmin mediante firma JWT o `/auth/v1/user`; las rutas ya no entran en bucle de login cuando falta el secreto JWT local.
- Desktop y móvil (390×844) revisados con capturas en `test-results/role-qa/`; no hay overflow. Los errores de analytics de Vercel en local se deben a endpoints no disponibles, no a la aplicación.
- Se corrigió la división por cero de `LineChart`/`MiniChart` cuando solo existe un punto; la consola deja de emitir SVG `NaN` en el portal.
- Resultado: typecheck, lint, tests de roles (13/13), diff check y build de 219 rutas correctos. Persisten como deuda separada los endpoints de analytics/insights ausentes en local.

### Comparativa y compatibilidad legacy (16/07/2026)

- Baseline reproducible: shell legacy owner en `/dashboard/academies` y shell legacy parent en `/dashboard/profile`.
- Destino moderno: owner en `/app/[academyId]/dashboard` y parent en `/app/[academyId]/my-dashboard`.
- La comparación muestra la diferencia de producto esperada: legacy prioriza cuenta/multi-academia y navegación duplicada; moderno prioriza jornada, contexto de academia, acciones del rol y estados de datos.
- Capturas desktop y móvil en `test-results/comparativa-ux/`; no se presenta una captura sintética como “antes”.
- Se ejecutó la Opción A: billing, settings y messages legacy redirigen al workspace moderno cuando existe academia; se conservan globales sin equivalente tenant claro. Detalle en `docs/plans/2026-07-16-legacy-routes-compatibility.md`.

### Validación runtime de compatibilidad (16/07/2026)

- El smoke inicial detectó que los `redirect()` de Server Components en rutas legacy podían quedar en 200 bajo el wrapper de observabilidad, dejando solo el shell antiguo.
- Se corrigió en `src/app/dashboard/layout.tsx` con un mapa único de rutas legacy y `LegacyWorkspaceRedirect`, que resuelve la academia activa y ejecuta `router.replace` hacia el workspace canónico.
- Verificado en build de producción local: owner (`/dashboard`, `/dashboard/billing`, `/dashboard/settings`, `/dashboard/messages`, `/dashboard/classes/calendar`) y parent (`/dashboard`, `/dashboard/messages`) terminan en `/app/44444444-aaaa-bbbb-cccc-444444444444/*` según rol.
- El hallazgo queda cerrado como riesgo de navegación; permanece únicamente la observación de uso legacy durante seis meses antes de evaluar retirada física.
