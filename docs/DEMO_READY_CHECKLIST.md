# Checklist demo vendible - Zaltyko

Fecha: 2026-07-07  
Objetivo: preparar una demo de 15 minutos para academias de gimnasia artistica/ritmica sin mostrar datos falsos ni prometer fiscalidad.

## Datos demo recomendados

- Academia: nombre realista, pais Espana, disciplina artistica o ritmica configurada.
- 8-12 gimnastas con edades/niveles variados.
- 2-3 grupos/clases con horarios claros.
- 2 entrenadores con asignaciones visibles.
- 1-2 sesiones de clase para pasar asistencia.
- 3-5 cuotas internas con estados pendiente, pagado y vencido.
- 2 evaluaciones/progresos tecnicos por gimnasta.
- 2 comunicaciones internas o anuncios.
- 1 super admin con 2-3 academias demo para mostrar operacion global.

## Dataset demo disponible en dev-session

Con `NEXT_PUBLIC_ENABLE_DEV_SESSION=true`, `/api/dev/session` prepara una academia demo estable para Espana con:

- Academia demo y usuario owner operativo.
- 3 gimnastas con grupo asignado.
- 1 grupo/clase de gimnasia con entrenador asignado.
- Asignaciones clase-entrenador y clase-gimnasta.
- Registros de asistencia coherentes.
- Cobros internos con estados utiles para demo.
- Evaluaciones/progreso tecnico basico.

Este dataset sirve para revisar pantallas sin inventar metricas historicas. No sustituye storage states reales por rol.

## Flujo de 15 minutos

1. Super admin revisa academias y usuarios.
2. Dueno entra al dashboard de su academia.
3. Dueno abre gimnastas y revisa ficha de una alumna.
4. Dueno abre grupos/clases y muestra asignaciones.
5. Entrenador registra asistencia en una clase.
6. Entrenador registra progreso tecnico simple.
7. Dueno revisa cuotas/cobros internos.
8. Dueno muestra comunicacion o recordatorios.
9. Cierre: explicar que Zaltyko gestiona academia, no fiscalidad oficial.

## Pantallas listas para mostrar

- Landing publica y login.
- Dashboard de academia si el entorno esta caliente.
- Atletas/gimnastas.
- Grupos/clases.
- Cobros internos si los datos demo estan cargados.
- Progreso/evaluaciones si hay datos reales.
- Super admin dashboard despues del refactor de metricas falsas.
- Rutas owner verificadas con dev-session: dashboard, gimnastas, grupos, clases, cobros, settings y my-dashboard.

## Pantallas parcialmente listas

- Super admin billing/support/settings: existen rutas, pero no deben ser foco si no hay datos.
- Parent/family dashboard: base existe, pero requiere QA con usuario parent real.
- Coach dashboard: base existe, requiere QA de permisos por asignacion.
- Comunicaciones avanzadas/WhatsApp: mostrar solo lo que funcione internamente; WhatsApp queda futuro/degradado si feature flag/env no esta listo.

## Pantallas a evitar por ahora

- Cualquier superficie que parezca facturacion fiscal oficial.
- Rutas legacy `/dashboard/*` salvo que se valide compatibilidad.
- Comparativas de academias sin datos reales por academia.
- Graficos de ingresos historicos si no hay serie real por periodo.
- Checkout Stripe real si se usan placeholders o price IDs no configurados.

## Bugs que impedirian vender

- Login o sesion demo redirige a `/auth/login` durante la demo.
- Dashboard muestra datos inventados como reales.
- Coach ve datos de otra academia o clase no asignada.
- Padre/familia puede ver atleta ajeno.
- Build o typecheck fallan.
- Copy visible menciona VeriFactu, AEAT, firma fiscal o facturacion oficial.

## Estado actual

- Build, lint, typecheck y Vitest pasan.
- Playwright e2e autenticado necesita credenciales demo vigentes; las actuales devuelven `Invalid login credentials`.
- Spec E2E minimo por rol existe, pero salta hasta tener storage states de super_admin, owner y coach.
- Dev-session renderiza las pantallas owner clave sin marcadores de error visibles.
- Se retiraron/neutralizaron metricas fabricadas del super admin.
- Se cambio copy visible de "facturacion/facturas/fiscal" a cobros, recibos y pagos internos en las superficies revisadas.
- Se endurecieron permisos API de coach para asistencia/progreso y scoping familiar de `/api/family/children`.
