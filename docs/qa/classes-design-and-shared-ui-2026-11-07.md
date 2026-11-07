# Panel del club: sistema visual nuevo (menú lateral, Resumen, Clases, Equipo)

## Hallazgos

Elvis rechaza el aspecto anterior y aprueba (7 nov) la dirección de la maqueta `/Users/elvisvaldesinerarte/projects/Zaltyko/documentacion/diseno-2026-11-07/zaltyko-direccion-visual.html`: estructura de SaaS de primer nivel (menú lateral, lienzo neutro, tarjetas finas, cifras grandes) adaptada a clubes de gimnasia (día organizado por sesiones, color por disciplina, tono de club).

Implementado en este corte:

- **Tokens** `z-*` en `tailwind.config.mjs`: lienzo `#F6F5F2`, línea `#E8E6E1`, tinta `#17161C`, violeta de marca, coral «magnesio» para atención/ahora, y color por disciplina (artística, rítmica, complementarias). Fuentes sin cambios: Space Grotesk (títulos y cifras) y Manrope (texto), ya incluidas.
- **Base común** `src/components/owner-dashboard/owner-ui.ts`: página, cabecera, tarjetas, indicadores, campos, botones, avisos, estados vacíos, chips y estilo por disciplina (`ownerDisciplineOf`).
- **Shell y navegación** (`OwnerWorkspacePageShell`, `OwnerWorkspaceNavigation`): a partir de 1280 px, menú lateral fijo agrupado (Día a día / Personas / Club) con iconos y «Más» (Equipo, Plan); por debajo, cabecera fija con la rejilla de seis accesos con icono. Aplica a las 20 páginas `/owner`.
- **Resumen**: cabecera con selector de sede compacto, indicadores en tarjetas y accesos rápidos con icono.
- **Clases**: sobre la base común, con color de disciplina en cada clase.
- **Equipo**: migrado a la base común.
- **Resto de pantallas del panel** (28 componentes): pasada de color (gris/teal → sistema `z-*`) y esquinas redondeadas en superficies con borde. Sin cambios de tamaño, rejilla, texto ni lógica.

## Garantías

- Sin cambios en estado, envíos, reintentos, diarios, permisos, rutas, capacidades ni datos.
- Navegación: se conservan `Principal` y `Navegación móvil`, nombres y `href` de enlaces, `aria-current`, «Más» en escritorio (7 enlaces directos + desplegable) y en móvil (5 + «Más», 6 objetivos ≥44 px), cierre del desplegable con devolución de foco, un único «Cerrar sesión» y ocultación en el alta inicial.
- Se conservan los textos y regiones que verifican las suites (Resumen, «Tu academia en marcha», «Ahora», «En este periodo», cobros, Clases, Equipo).
- Ningún test comprueba clases de color; las dos aserciones de clase existentes (`min-h-11`, rejilla de factura) no se tocan.
- No se muestra ocupación de plazas en Clases: la consulta actual no devuelve inscritos y no se inventa el dato.

## Verificación

- Revisión estática: `git diff --check`, iconos existentes en el repo, sin imports sin usar.
- Sin tests, tipos, lint ni build locales (regla del proyecto). Pendiente CI remota completa, revisión externa, publicación en entregas y aceptación visual a 375/768/1280.

## Siguiente paso (diseño)

1. Bloques de la maqueta que requieren consultas nuevas: «Hoy en el club» (sesiones del día con pasar lista), «Necesita tu atención», asistencia semanal, ocupación por clase, reparto por disciplina.
2. Pasar lista móvil con botones grandes; barra inferior en móvil (cambia el contrato de geometría E2E actual, se hará con su test).
3. Rediseño fino por pantalla (Grupos, Asistencia, Gimnastas/Familias, Cobros, Configuración, Plan) sobre `owner-ui.ts`.

## Hoy en el club (Resumen)

- Consulta nueva de solo lectura `src/modules/owner-dashboard/application/today-sessions.ts`: sesiones cuyo inicio local (zona horaria de cada sede) es hoy, limitadas a las sedes del alcance ya autorizado por `resolveOwnerScope` (agregado de organización o sede seleccionada, igual que el resumen operativo). Máximo 25, con aviso si hay más.
- «Esperados» usa la misma regla que la lista de asistencia (`owner-session-attendance.ts`): inscripciones `active`/`trial` con inicio ≤ fecha de la sesión y fin estrictamente posterior. «Lista pasada» = registros de asistencia de esa sesión.
- Panel `OwnerTodaySessionsPanel`: hora local por sede, color de disciplina, «Ahora» durante la sesión, «Cancelada» sin acción, recuento de listas pendientes y enlace a `/owner/attendance` con la sesión exacta. Un fallo de consulta se muestra como no disponible, no como día vacío.
- Sin SQL nuevo ni migraciones; sin escrituras. Tests: `tests/owner-today-sessions-panel.test.tsx` y dos casos nuevos en `tests/owner-dashboard-page-operational.test.tsx`. No ejecutados en local.
