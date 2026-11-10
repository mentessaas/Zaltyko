# Resumen ejecutivo — investigación competitiva (10-11-2026)

**Hallazgo principal.** En España ya hay al menos cinco ofertas que hablan directamente a clubes de gimnasia: RG Manager, ScoreGym Club, GimnasiaTotal, Clybo’ y OneClub. Clupik es la alternativa generalista con más trayectoria. Las cinco primeras se venden por **cobros, familias y documentos**. Ninguna muestra evidencia pública de resolver **la coordinación de grupos, entrenadoras y horarios sin choques**. Zaltyko tiene hoy un núcleo operativo real (grupos, clases, sesiones, asistencia, inscripciones y cuotas manuales). Le faltan dos piezas cercanas a ese hueco: asignar entrenadoras a sesiones y dejarlas entrar.

- **Fuente:** [fichas-competidores.md](./fichas-competidores.md) y [matriz-competitiva.md](./matriz-competitiva.md), con enlaces y nivel de evidencia junto a cada dato.
- **Importancia:** alta. Define a quién vender primero y qué construir.
- **Siguiente paso:** el [plan de validación a 30 días](./plan-validacion-30-dias.md).

## Comprobado, inferido e hipótesis

| Tipo | Ejemplos |
|---|---|
| **Comprobado (observado o confirmado)** | RG Manager: 35/79/150 € IVA incluido, app iOS desde el 16-05-2026, 100+ descargas en Android. El PDF de Google Drive es idéntico al de su web; su IA solo aparece en el dosier ([web](https://www.rgmanager.com/), [App Store](https://apps.apple.com/es/app/rg-manager/id6762121877)). La demo de ScoreGym muestra grupos con entrenadora, pista, cuota y SEPA XML ([demo](https://club.scoregym.es/demo.php)). USA Gymnastics da a sus clubes un portal FlipBiz gratuito para 4 personas ([USAG](https://usagym.org/usa-gymnastics-announces-new-member-club-benefit-through-flipbiz-educational-partnership/)). En Zaltyko existe `zaltyko.session_staff`, pero no hay API ni pantalla para asignar entrenadoras. |
| **Declarado por la empresa** | Clupik: 1.000+ clubes. OneClub: 150+ clubes. Jackrabbit: 7.000+ clientes. Funciones de IA de RG Manager y FlipBiz. |
| **Inferido** | El comprador inicial es la dirección técnica o directiva de un club de 30 a 150 gimnastas. Los límites de grupos de Zaltyko (5 en Starter) pueden frenar a clubes medianos. |
| **Hipótesis por validar** | El cuadrante de grupos, entrenadoras y horarios es un dolor semanal. Avisar de choques de entrenadora o pista tiene valor de compra. Akros se usa solo como ejemplo de cómo trabaja una academia; no es prueba de mercado. |

## Las tres decisiones de esta semana

1. **Vender primero a academias y clubes de rítmica o artística en España de 30 a 150 gimnastas, con 3 a 10 entrenadoras.** La puerta de entrada es la **operación diaria**: grupos, entrenadoras, horarios y asistencia. No se entra por cobros.
   - *Qué la cambiaría:* que 6 de cada 10 entrevistas pongan el cobro de cuotas o la remesa SEPA como primer dolor. En cobros, RG Manager, OneClub y Clybo están mejor resueltos.
2. **Construir primero el acceso de entrenadoras (invitaciones) y la asignación de entrenadora por clase, con sustitución por sesión.** Ambas piezas se apoyan en modelos que ya existen. Los avisos de choque de entrenadora o pista quedan detrás, como diferenciación que hay que validar.
   - *Qué la cambiaría:* que los clubes entrevistados casi nunca tengan sustituciones ni choques. Entonces la prioridad pasaría a la importación desde Excel y a cerrar el recorrido solicitud de prueba → inscripción.
3. **No tocar precios ni límites esta semana.** En las entrevistas hay que preguntar explícitamente por el límite de 5 grupos de Starter.
   - *Qué la cambiaría:* que 4 de cada 10 clubes de menos de 75 gimnastas tengan más de 5 grupos. En ese caso habría que tomar una decisión de pricing documentada, con su actualización de catálogo, tests y vault.

## En cinco líneas

- **A quién vender primero:** academias y clubes de rítmica o artística en España de 30 a 150 gimnastas y 3 a 10 entrenadoras, donde la dirección técnica monta el cuadrante en Excel y lo comunica por WhatsApp.
- **Qué promesa usar:** «Organiza grupos, clases y asistencia de tu academia de gimnasia en un solo sitio; tu equipo ve las sesiones de hoy y pasa lista en un toque». Cuando existan la asignación y los avisos de choque, pasará a «tu cuadrante de grupos y entrenadoras, sin choques».
- **Qué construir o mejorar primero:** invitaciones de entrenadoras, entrenadora titular por clase con sustitución por sesión, e importación desde Excel con vista previa.
- **Qué posponer:** remesas SEPA y cobro a familias, app nativa, competiciones, campus, tienda, control horario e IA.
- **Qué validar con clientes esta semana:** con qué frecuencia cambian horarios y entrenadoras, y quién lo gestiona; cuántos grupos tienen frente a su número de gimnastas; si pagarían 19 € o 49 € al mes más IVA con el producto actual.

## Panel de inteligencia competitiva

Dentro del repositorio hay un panel interno para consultar y mantener esta investigación.

- **Dónde:** `/super-admin/competencia`, accesible desde «Competencia» en la navegación de super-admin. Solo lo ven perfiles `super_admin`.
- **Qué incluye:**
  - Resumen visual: cambios recientes, empresas pendientes de investigar, datos que conviene volver a comprobar y oportunidades prioritarias.
  - Listado con buscador y filtros por tipo, país, disciplina, tamaño de cliente, estado de investigación y archivados.
  - Ficha por empresa con 16 secciones, cada una con estado del dato, nivel de evidencia, fecha de comprobación, plazo de revisión y fuentes vinculadas.
  - Precios con coste estimado para clubes S, M y L, cobertura de los 25 flujos de producto e historial de cambios.
  - Archivar, marcar inactivo y reactivar, conservando todo el historial.
  - Comparación de hasta seis empresas, con Zaltyko como referencia.
  - Registro de fuentes y oportunidades editables, y edición del estado real de Zaltyko por flujo.
- **Datos iniciales:** `src/content/competencia/semilla-2026-11.json` contiene las 9 empresas de la lista, 43 fuentes con fecha, 20 planes de precios, 25 flujos con su estado en Zaltyko y referencias al código, 101 coberturas y 9 oportunidades. Los huecos aparecen como «Pendiente de investigar»; no se rellenaron con suposiciones.
- **Dónde se guardan los datos:** en Postgres, en ocho tablas `public.ci_*`.
  - Las crea el candidato `docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql`, que **no se ha aplicado en ningún entorno alojado** y necesita autorización expresa.
  - Mientras no se aplique, el panel muestra «no disponible» sin errores.
- **Cómo arrancarlo en local:**
  1. Aplica el candidato SQL a un Postgres local que tenga `public.profiles`.
  2. Carga los datos con `pnpm db:seed:competencia`, o con el botón «Cargar datos iniciales» del panel. La carga es idempotente: solo inserta lo que falta.
  3. Arranca la app con `pnpm dev` y entra con un perfil `super_admin`.
- **Comprobado el 10-11-2026** (Postgres efímero local y `next dev`):
  - El candidato SQL se instala, se niega a reinstalarse, fuerza RLS y deniega el acceso a `anon` y `authenticated`.
  - La semilla es idempotente: la segunda ejecución insertó 0 filas.
  - Recorrido completo en el navegador: estado vacío → carga inicial → alta de empresa → dos fuentes → sección verificada con fuente → comparación → oportunidad vinculada → archivado con historial → los datos persisten al recargar → filtro de archivados.
  - Sin desbordamiento horizontal a 375 px en ninguna página del panel.
