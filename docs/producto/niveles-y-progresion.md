# Niveles y progresión por aparato (brecha A6)

Fecha: 14 de noviembre de 2026. Origen: análisis de competencia (`documentacion/Zaltyko/auditoria-2026-11-14/brechas-competencia.md`, punto A6; el seguimiento de habilidades de iClassPro como referencia). Continúa los objetivos y observaciones por gimnasta (`docs/producto/objetivos-y-observaciones.md`).

**Estado: apagado y sin aplicar en ningún entorno.** Necesita dos cosas a la vez:

1. El candidato SQL `docs/deployment/candidates/20261114121000_skill_levels_candidate.sql`, que **requiere autorización de Elvis** antes de aplicarse en staging o producción.
2. La bandera de servidor `ZALTYKO_SKILL_LEVELS_ENABLED=true` (por defecto `false`, documentada en `.env.example`).

Si falta cualquiera: las páginas dan 404, las API responden 503 con el motivo `skill_levels_unavailable`, los enlaces de Grupos y Asistencia no aparecen y `/familia` no muestra la sección. No hay errores 500 ni escrituras a medias.

## Qué resuelve

Una academia define sus **niveles** por disciplina, con los **elementos** de cada nivel en cada **aparato**. Cada gimnasta tiene un estado por elemento (no iniciado, en progreso, conseguido, con fecha y quién lo evaluó), un **nivel actual** y un **paso de nivel** registrado, que genera un **diploma** imprimible. El equipo evalúa a varias gimnastas a la vez desde una clase o un grupo, y las familias ven el progreso en solo lectura. No copia a ningún competidor: es la progresión por aparato de la gimnasia artística y rítmica.

## Qué hay

- **Plantilla de niveles.** Una por disciplina (artística femenina GAF, artística masculina GAM y rítmica GR; mismas claves que las disciplinas de la academia: `artistic_female`, `artistic_male`, `rhythmic`). Tiene nombre, descripción opcional y una lista ordenada de **niveles**; cada nivel, de **elementos** con su aparato (o «General») y una marca de **obligatorio** para pasar de nivel.
  - La academia puede **crear en blanco**, **copiar un ejemplo de Zaltyko** o **copiar una plantilla suya**, y **editarla**: renombrar, reordenar, añadir y quitar niveles y elementos, cambiar el aparato y lo obligatorio.
  - Lo que se quita **se archiva**, no se borra: el progreso y los pasos de nivel ya registrados se conservan. Una plantilla también se archiva y se restaura. El nombre es único entre las plantillas activas de una disciplina; hay un tope de 40 plantillas activas, 20 niveles, 40 elementos por nivel y 300 por plantilla.
  - Aparatos por disciplina: GAF salto, paralelas asimétricas, barra y suelo; GAM suelo, caballo con arcos, anillas, salto, paralelas y barra fija; GR cuerda, aro, pelota, mazas, cinta y «manos libres». Un elemento sin aparato es «General» (preparación física, flexibilidad…).
- **Plantillas de ejemplo.** Tres (GAF, GAM y GR), de cuatro niveles cada una (Iniciación y Niveles 1 a 3), escritas por Zaltyko como progresión pedagógica general. **No reproducen la estructura, la nomenclatura ni los requisitos de ninguna federación** (ni RFEG ni FMG ni otras): por eso no citan fuente federativa. Viven en código (`src/modules/skill-levels/domain/starter-templates.ts`), se marcan en pantalla como «plantilla orientativa» y nada se aplica solo: la academia las copia y las adapta antes de usarlas. Un test impide que citen una federación.
- **Estado por elemento.** `no iniciado` (ausencia de fila), `en progreso` o `conseguido`. Al conseguirlo se guarda la fecha (por defecto, hoy en la zona de la sede; nunca futura) y quién lo evaluó. Marcar de nuevo lo mismo no cambia ni la fecha ni quién lo consiguió. Quitar el logro vacía la fecha.
- **Nivel actual y paso de nivel.** El nivel actual es el primero, por orden, sin paso de nivel registrado. Un nivel está **completo** cuando todos sus elementos **obligatorios** están conseguidos (los opcionales no cuentan). Cuando el actual está completo la ficha y las listas avisan «listo para pasar de nivel» y el equipo registra el **paso de nivel** con su fecha. Reglas, comprobadas en el servidor:
  - los niveles se superan en orden;
  - un nivel sin elementos obligatorios no se puede pasar (haría falta marcar alguno);
  - un nivel superado no se vuelve a pasar;
  - el paso de nivel es un hecho con fecha: si luego se edita la plantilla, no se recalcula.
- **Diploma.** Cada paso de nivel tiene su diploma (el identificador del paso es el del diploma): academia, gimnasta, plantilla, nivel, fecha y los elementos obligatorios conseguidos, en A4 apaisado con el sistema visual «Magnesio sobre tapiz» (`src/components/skill-levels/SkillDiploma.tsx`). Se imprime desde el navegador, donde también se guarda como PDF, sin dependencias nuevas. La marca de la academia es hoy su nombre y las firmas de dirección técnica y de entrenadora; **la academia aún no tiene logotipo ni color propio guardados** (ver «Decide Elvis»).

## Dónde se ve

- **Niveles y progresión** (`/owner/skills`): plantillas (crear, copiar, editar, archivar) y los grupos de la sede para evaluar. Se llega desde el botón «Niveles y progresión» de Grupos.
- **Evaluar un grupo o una clase** (`/owner/skills/evaluate`): se elige la plantilla y un nivel, se marcan los **elementos**, se marcan las **gimnastas** (todas de una vez si se quiere) y se guarda el estado con un solo gesto. Pensado para el móvil en el tapiz: filas y botones grandes, la acción al final. Debajo, el **progreso del grupo** por nivel (superado o porcentaje de obligatorios) con enlace a la hoja de cada gimnasta, y la lista de las **listas para pasar de nivel**. Desde una clase, el enlace «Evaluar niveles» de la sesión en Asistencia abre la lista de sus gimnastas (inscritas o de un grupo vinculado, con el mismo criterio que Pasar lista).
- **Hoja de la gimnasta** (`/owner/skills/athletes/[id]`): cada plantilla con su avance, cada nivel desplegable, el estado de cada elemento con tres botones, «Pasar de nivel» y el diploma de lo superado.
- **Diploma** (`/owner/skills/diploma/[gimnasta]/[paso]`): página sin marco para imprimir.
- **Familias** (`/familia/gimnastas/[id]`): una sección nueva, **solo lectura**, «Niveles y progreso» con las plantillas de la gimnasta, el estado de cada elemento, las fechas, los niveles superados y el enlace a cada diploma (`/familia/gimnastas/[id]/diplomas/[paso]`). Sin formularios, sin botones y **sin nombres del equipo**.

## Quién puede qué

| Rol | Ver plantillas | Crear, copiar, editar, archivar plantillas | Evaluar y pasar de nivel | Ver diploma |
|---|---|---|---|---|
| Dirección, administración y coordinación (todas las sedes) | Sí | Sí | Cualquier gimnasta vinculada a la sede, también con grupo terminado | Sí |
| Coordinación con sedes seleccionadas | Sí | Sí | En sus sedes | En sus sedes |
| Entrenador/a | Sí (las plantillas son de toda la academia) | **No** (403) | Solo gimnastas con inscripción o grupo **abierto** en una sede asignada (mismo criterio que Pasar lista); nunca archivadas | En su sede |
| Familias | Solo en `/familia`, de su gimnasta | No | No | Solo el de su gimnasta |

Todo se comprueba en el servidor, dentro de la transacción de cada operación, igual que en objetivos y observaciones: bandera y tablas, miembro activo, rol permitido, sede dentro de su alcance, sede de la academia y activa, gimnasta de la academia y vinculada a la sede, plan fuera de solo lectura en escrituras. El progreso **pertenece a la gimnasta, no a la sede**: no se filtra por la sede desde la que se evaluó (que sí se guarda). La app conecta como `postgres` con `BYPASSRLS`, así que este control es el que aísla; RLS (`ENABLE` + `FORCE`) y los `REVOKE` a `anon` y `authenticated` son defensa en profundidad.

Las familias usan el mismo mecanismo que el resto de `/familia`: la cuenta debe ser tutora activa con `can_view_athletes` de una familia activa con la gimnasta vigente, y cada consulta repite esa cadena en SQL (`familyCanViewAthlete`). Una gimnasta ajena o desconocida es un 404.

## Escrituras y concurrencia

- **Evaluar en bloque.** Una petición marca `gimnastas × elementos` con un mismo estado (hasta 60 gimnastas, 40 elementos y 400 marcas). Va con `clientRequestId`: repetir la misma petición no vuelve a escribir (se detecta por la auditoría, que guarda un SHA-256 del cuerpo), y repetirla con **otros datos** responde 409 («Este cambio ya se guardó; recarga la página»). Si un elemento o una gimnasta no es válido, no se escribe nada.
- **Carreras.** Antes de escribir, la evaluación y el paso de nivel bloquean la fila de cada gimnasta (`FOR NO KEY UPDATE`, en orden de id): dos peticiones distintas sobre la misma gimnasta se serializan. Aun así la inserción usa `ON CONFLICT DO UPDATE` y la actualización comprueba la revisión (si no toca ninguna fila, 409), y el paso de nivel usa `ON CONFLICT DO NOTHING` y responde 409 «ya superado» en vez de un error de base de datos.
- **Editar una plantilla** guarda la estructura entera con la revisión que se vio (`expectedRevision`): otra persona que la haya cambiado produce un 409. Los elementos con `id` se actualizan, los nuevos se crean y los ausentes se archivan.
- **Paso de nivel.** Idempotente por `clientRequestId` (reutilizarlo con otro nivel es 409); además hay un único paso por gimnasta y nivel.
- **Auditoría.** `zaltyko.audit_log` registra altas, ediciones, archivos, evaluaciones (con recuentos, no con los nombres) y pasos de nivel.

## Modelo de datos (candidato)

Cinco relaciones nuevas en `zaltyko`, aditivas y sin tocar nada existente. Todas las claves foráneas son compuestas con `organization_id`, las restricciones tienen nombre de menos de 63 caracteres y el espejo Drizzle (`src/modules/skill-levels/infrastructure/skill-levels-schema.ts`, fuera de `src/db/schema/` por la misma razón que el de objetivos) repite las CHECK y los únicos.

- `skill_templates`: disciplina, nombre, descripción, origen (`blank`, `starter`, `copy`), clave del ejemplo, archivo, revisión y autoría (opcional: queda vacía si la persona deja la academia).
- `skill_levels`: nivel de una plantilla, con su posición y archivo.
- `skill_elements`: elemento de un nivel, con aparato opcional, `is_required`, posición y archivo. La FK compuesta obliga a que el nivel sea de la misma plantilla.
- `athlete_skill_progress`: una fila por gimnasta y elemento (`not_started`, `in_progress`, `achieved`), con fecha del logro (existe si y solo si está conseguido, por CHECK), sede, evaluadora y revisión. Sede y evaluadora son opcionales.
- `athlete_level_passes`: un paso por gimnasta y nivel, con fecha, sede y quién lo registró (opcionales). Su identificador es el del diploma.

Las claves foráneas a miembros del equipo y a sedes son `on delete set null (columna)`, con su índice: dar de baja a una entrenadora o una sede no se bloquea por su historial, que se conserva sin autoría (la vista lo muestra sin nombre).

Hay que **aplicar el candidato solo con autorización expresa**. Reinstalar aborta antes de tocar nada si alguna de las cinco tablas ya existe. No depende del candidato de objetivos y observaciones.

## Derechos de datos

Quedó cableado desde el primer día, para que aplicar el candidato no rompa nada:

- **Exportación de la academia** (`OPTIONAL_INCLUDED_EXPORT_MODULES`, módulo `skill_levels`): las cinco tablas se exportan con sus valores y el mismo control exacto de columnas; solo se omiten las claves de reintento (`client_request_id`). Sin las tablas, el paquete es idéntico al anterior.
- **Verificación y plan de disposición:** aceptan el módulo, todo o nada.
- **Supresión** (`activated-modules-erasure-policy.ts`): el progreso y los pasos de nivel se borran en cascada con la ficha de la gimnasta; la autoría de una integrante del equipo queda en blanco (`set null`), a diferencia de objetivos y observaciones, donde bloquea la baja; plantillas, niveles y elementos son de la academia y no cuelgan de ninguna gimnasta. Todo se va con la academia.
- `tests/data-rights-activated-modules-contract.test.ts` deduce cada efecto del SQL del candidato y falla si no coincide.

## Cómo probarlo en staging

Requiere que Elvis autorice aplicar el candidato en el proyecto de staging (`oucxnnrtfmjjlnffldfc`; ver `docs/deployment/staging.md`). Nada de esto toca producción.

1. Aplicar `20261114121000_skill_levels_candidate.sql` en staging y definir `ZALTYKO_SKILL_LEVELS_ENABLED=true` en el entorno de staging (Vercel). Redesplegar.
2. Entrar como dirección en `https://staging.zaltyko.com/owner/groups`: aparece el botón «Niveles y progresión». Antes del paso 1 no aparece y `/owner/skills` da 404.
3. En `/owner/skills`, crear una plantilla **desde un ejemplo** (GAF), ver el aviso de plantilla orientativa, renombrar un nivel, quitar un elemento y añadir otro. Copiarla con otro nombre.
4. Abrir un grupo («Evaluar un grupo»): elegir el nivel «Iniciación», marcar dos elementos y varias gimnastas y pulsar «Conseguido». Comprobar que el progreso del grupo sube y que, al completar los obligatorios de una gimnasta, aparece en «Listas para pasar de nivel».
5. Pulsar «Pasar de nivel», abrir la hoja de la gimnasta y el diploma, e imprimir o guardar como PDF (A4 apaisado).
6. En Asistencia, abrir una sesión y pulsar «Evaluar niveles»: se listan las gimnastas de la clase.
7. Iniciar sesión como entrenadora de una sede: ve las plantillas y evalúa a las gimnastas de su sede; no puede crear ni editar plantillas (403) ni ver a gimnastas de otra sede.
8. Iniciar sesión como una familia con la gimnasta vinculada: en `/familia/gimnastas/[id]` aparece «Niveles y progreso» de solo lectura con el diploma. Con la bandera apagada la sección desaparece.
9. Con el plan en solo lectura se consulta todo y los controles de escritura quedan desactivados.

## Decide Elvis

1. **Aplicar el candidato y activar la bandera**, primero en staging y luego en producción.
2. **Marca de la academia en el diploma.** Hoy es el nombre y los colores de Zaltyko. Un logotipo y un color por academia exigen un campo nuevo (organización) y almacenamiento de imágenes: no se ha hecho.
3. **Anular un paso de nivel.** No hay anulación ni edición: el paso es un hecho con fecha. Si se registra por error hay que resolverlo en base de datos. Falta decidir quién podría anularlo y cómo queda el diploma.
4. **Entrenadores y plantillas.** Solo leen; la edición es de dirección, administración y coordinación. Decidir si una entrenadora jefa puede proponer cambios.
5. ~~Quién pasa de nivel.~~ **Resuelto (14-11-2026, coordinación):** la entrenadora evalúa a cualquier gimnasta con inscripción o grupo abierto en su sede (no solo a las de sus clases) y puede registrar el paso de nivel; queda en la auditoría con su autoría. Se mantiene así.
6. **Familias y fechas anteriores al vínculo.** El portal limita el horario y la asistencia a lo posterior al vínculo con la familia. El progreso y los diplomas son logros de la gimnasta y se muestran enteros. Decidir si debe aplicarse el mismo corte.
7. **Plantillas por país y federación.** Las plantillas de ejemplo son genéricas a propósito. Una plantilla basada en el programa de la RFEG (España) o de la FMG (México) exige citar la fuente pública y revisar su licencia: no se ha hecho.
8. **Nivel inicial.** El nivel actual de una gimnasta nueva es el primero de la plantilla. Una gimnasta que llega con nivel hoy debe marcarse elemento a elemento, o pasar los niveles en orden; no hay «empezar en el nivel 3».
9. **Avisos a las familias.** Al pasar de nivel no se envía ningún aviso; la familia lo ve al entrar. Depende de la sesión de avisos.

## Pruebas

- `tests/skill-levels-domain.test.ts`: bandera, validación de órdenes, permisos, plantillas de ejemplo (válidas, con aparatos de su disciplina, sin citar federaciones) y todos los cálculos: porcentaje de nivel, nivel actual, «listo para pasar», reglas del paso de nivel, resumen por aparato y fechas.
- `tests/skill-levels-contract.test.ts`: candidato, espejo Drizzle y detección con las mismas tablas, columnas, tipos, `NOT NULL`, defaults, CHECK y únicos; RLS y `REVOKE`; fuera de drizzle-kit; bandera apagada y documentada.
- `tests/skill-levels-routes.test.ts`: orden de las comprobaciones de las nueve rutas (401, 403 de origen, 400, alcance, 429), 503 «no disponible», errores del servicio y 201 frente a 200 en repeticiones.
- `tests/skill-levels-ui.test.tsx`: evaluación de varias gimnastas a la vez, paso de nivel, tabla de progreso, solo lectura, «no disponible» solo con el motivo exacto, diploma y sección de familias.
- `tests/skill-levels-pg.test.ts` (job «Postgres integration»): función dormida (bandera y tablas), preflight, RLS/REVOKE, aislamiento entre academias, roles, plantillas (alta, copia, edición, archivo), evaluación idempotente y concurrente, vínculo con la sede, gimnastas archivadas o con grupo terminado, paso de nivel, listas de grupo y de sesión, diploma y lectura de familias.
- `tests/data-rights-activated-modules-contract.test.ts`: clasificación de exportación y supresión de las cinco tablas.
- `tests/owner-coach-route-matrix.test.ts`: las nueve rutas constan como accesibles al entrenador por diseño (la edición de plantillas la deniega el servicio).
