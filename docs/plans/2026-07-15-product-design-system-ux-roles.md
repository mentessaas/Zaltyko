# Plan: Product Design System + UX por roles

Estado: implementación principal completada tras auditoría. Queda una ventana operativa de seis meses para observar uso de rutas legacy antes de retirar compatibilidad.

## Objetivo

Reconstruir la experiencia de Zaltyko como un único producto especializado en gimnasia artística y rítmica, preservando permisos, rutas canónicas, datos y contratos backend.

## Fuente de verdad

La auditoría completa, el mapa de roles, la navegación propuesta, el Design System 2.0, el plan de migración, los riesgos y criterios de aceptación están en:

`vault/07-Auditorias-y-Riesgos/Auditoria UX UI integral - 2026-07-15.md`

## Orden de ejecución y estado

1. **Completado** — Auditoría, inventario, mapa de roles y dirección visual documentados.
2. **Completado** — Foundations, shell, navegación por rol y navegación móvil.
3. **Completado** — Owner dashboard, cockpit de coach y redirecciones seguras.
4. **Completado** — Gimnastas, grupos, calendario, asistencia, cobros y comunicación.
5. **Completado** — Portal limitado parent/athlete y progreso técnico inicial.
6. **Completado** — Reportes, eventos, ajustes y primera capa del superadmin.
7. **Completado** — QA visual/funcional autenticada de parent, athlete y superadmin en build de producción local, incluyendo desktop y móvil.
8. **Completado (16/07/2026)** — Comparativas antes/después y primera retirada controlada de legacy. Pendiente únicamente la observación de uso durante seis meses y el cierre de deuda residual no bloqueante.

## Gates

- Ningún módulo se implementa antes de aprobar dirección y arquitectura.
- Ningún patrón nuevo entra sin token/componente canónico.
- Ninguna ruta se retira sin telemetría, redirect y test de rol.
- Ninguna pantalla se cierra solo porque compila: requiere QA visual, funcional, responsive y accesible.

## Ampliación de paneles por rol

La auditoría autenticada confirma que el shell, los menús y los dashboards deben reemplazarse, no retocarse. Prioridad inmediata tras aprobación:

1. Owner: cockpit de atención, hoy y pulso.
2. Admin: cola diaria de tareas.
3. Coach: `Hoy` como home y navegación móvil.
4. Parent: próxima clase, avisos, pagos y contacto.
5. Athlete: progreso, objetivos y feedback.
6. Superadmin: riesgo, salud, negocio y actividad.

La barra móvil se limita a cuatro destinos más `Más`; se elimina el FAB global y se separa Plan Zaltyko de Cobros a familias.

## Evidencia de sesiones y QA (15/07/2026)

- Se recuperaron sesiones E2E locales válidas para `parent`, `athlete` y `super-admin` sin guardar credenciales en el repositorio.
- Rutas verificadas: portal limitado (`my-dashboard`, `messages`, `notifications`) y panel superadmin (`dashboard`, `academies`, `users`).
- Se corrigió el entrypoint de middleware para proyectos con `src/app` y se validó el gate en producción local; se añadió fallback remoto verificado para Supabase cuando no existe `SUPABASE_JWT_SECRET`.
- Capturas desktop/móvil: `test-results/role-qa/`.
- Los fallos de consola restantes son solo scripts de Analytics/Speed Insights no servidos en local; la aplicación y las rutas protegidas responden correctamente.

### Evidencia comparativa y compatibilidad legacy (16/07/2026)

- Capturas reales owner y parent en desktop/móvil: `test-results/comparativa-ux/` (ocho artefactos, cuatro superficies legacy y cuatro modernas).
- La comparativa confirma el cambio de shell global a workspace de academia: navegación por rol, hero operacional, KPIs y acciones prioritarias frente al menú global y tarjetas genéricas anteriores.
- `/dashboard`, `/dashboard/billing`, `/dashboard/settings`, `/dashboard/messages` y las rutas de módulos legacy redirigen en cliente al workspace moderno tras resolver la sesión y la academia activa; se conserva la compatibilidad sin borrar URLs.
- Smoke autenticado en build de producción local: owner (`dashboard`, `billing`, `settings`, `messages`, `classes/calendar`) y parent (`dashboard`, `messages`) terminaron en las rutas `/app/[academyId]/*` esperadas, sin overflow en las vistas revisadas.
- La revisión de retirada está documentada en `docs/plans/2026-07-16-legacy-routes-compatibility.md`; no se modificaron contratos backend, permisos ni migraciones.
