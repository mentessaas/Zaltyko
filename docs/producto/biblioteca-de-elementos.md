# Biblioteca de elementos (fase C)

Fecha: 19 de noviembre de 2026. Origen: ADR-0029 (`docs/architecture/adr/0029-biblioteca-de-elementos-y-niveles.md`), §1–§3, §8, §9 y §11, con las decisiones de Elvis del 19-11-2026. Continúa los niveles y la progresión por aparato (`docs/producto/niveles-y-progresion.md`) y la planificación de sesiones (`docs/producto/planificacion-sesiones.md`).

**Estado: apagada y sin aplicar en ningún entorno.** Necesita tres cosas a la vez:

1. Las candidatas SQL `20261119120000_element_library_candidate.sql` y `20261119120500_element_library_notes_candidate.sql`, y al menos una semilla de tanda, en `docs/deployment/candidates/`. Cada una **requiere autorización de Elvis** por entorno (staging y producción).
2. La bandera de servidor `ZALTYKO_ELEMENT_LIBRARY_ENABLED=true`, junto con `ZALTYKO_SKILL_LEVELS_ENABLED=true` (las dos, por defecto `false` en `.env.example`).
3. Elementos **revisados por Elvis** en una edición publicada. La tanda 1 (51 saltos) está revisada desde el 19-11-2026; las academias la ven cuando se aplica su semilla revisada.

Si falta la bandera o las tablas: la página da 404, las API responden 503 con el motivo `element_library_unavailable` y el botón «Añadir desde la biblioteca» no aparece. Niveles, guiones y la exportación de la academia siguen funcionando igual, con o sin las tablas nuevas.

Las descripciones van aparte, con su propia bandera: `ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED=true` (por defecto `false`). Apagada, la ficha muestra nombre, aparato, grupo y valor, sin descripción.

## Qué resuelve

Hasta ahora cada academia escribía a mano el nombre de cada elemento de sus niveles. La biblioteca da un **vocabulario común**: el grupo y el valor de cada elemento según el Código de Puntuación de la FIG, con un nombre en español y, si se enciende, una descripción breve redactada por Zaltyko. La academia sigue escribiendo lo suyo: su nombre para el elemento, su nota técnica, sus niveles y sus guiones. Nada de lo que ya existe cambia.

## Qué hay

- **Catálogo por edición.** Una edición por disciplina y ciclo: hoy `fig-wag-2025-2028` (artística femenina, Código 2025-2028, portada del 14-10-2026). La artística masculina (`fig-mag-2025-2028`) llegará con sus tandas. La rítmica queda fuera de esta fase.
- **Ficha de cada elemento.** Nombre y nombre corto en español (los epónimos se conservan como nombre técnico, por ejemplo «Tsukahara»), aparato, grupo, valor (letra `A`–`J`, o puntos en salto) y el número del Código solo como referencia. Con la bandera de descripciones, una o dos frases propias.
- **Sin vídeo y sin imágenes.** La biblioteca no muestra ni guarda vídeos, enlaces de YouTube, dibujos ni direcciones de terceros (decisiones 9 y 4 de Elvis). Si se quiere más adelante, irá en otro ADR, después de que el abogado responda L15 y L16.
- **Nota de la academia.** Cada academia puede escribir una nota técnica por elemento (hasta 500 caracteres): progresiones, ayudas, errores típicos de su club. La lee todo el equipo de la academia; las familias no la ven.
- **Pie de atribución fijo**, en la lista y en cada ficha, con el título y la fecha de la edición:

  > Valores y grupos según el Código de Puntuación de Gimnasia Artística Femenina 2025-2028 de la FIG (World Gymnastics), edición publicada el 14-10-2026. Las descripciones las redacta Zaltyko y no son el texto oficial; si hay diferencias, manda el documento oficial: [enlace]. Zaltyko no está afiliado a la FIG ni cuenta con su respaldo.

  La FIG solo se nombra en texto, sin logos. Los epónimos no se usan en publicidad, SEO ni campañas.

## Qué puede hacer una academia

- **Buscar** por disciplina (solo las que tienen edición publicada), aparato, grupo y valor, y por nombre.
- **Abrir la ficha** de un elemento y **guardar la nota de la academia** («Esta nota la ve todo el equipo de la academia»). Si otra persona la cambió a la vez, se avisa en lugar de pisarla.
- **«Añadir desde la biblioteca»** en las plantillas de niveles: junto a «Añadir elemento», abre la biblioteca filtrada por la disciplina de la plantilla y el aparato. Al elegir, se añade un elemento con el nombre corto, que la academia puede cambiar; el nombre sigue siendo suyo y obligatorio. Solo se enlaza un elemento del mismo aparato y disciplina. Copiar una plantilla copia el enlace.
- **Enlace opcional en los bloques del guion**: un bloque con disciplina de artística y aparato puede enlazar un elemento de la biblioteca (como máximo uno). El contenido del bloque sigue siendo texto libre y obligatorio.
- **Elemento retirado o de una edición anterior:** el enlace se conserva y se ve el nombre de la academia con el aviso «Ya no está en la biblioteca» o «Edición anterior». En las plantillas de niveles, si la edición nueva tiene el mismo elemento, se ofrece «Actualizar enlace»; en el guion, el bloque muestra «Edición anterior» sin botón para actualizarlo. El enlace nunca se cambia solo.

Los datos que ya existen no se tocan: las columnas de enlace nacen vacías, sin relleno automático ni emparejamiento por nombre. Progreso, pasos de nivel, diplomas y guiones no cambian.

## Dónde se ve

- **Biblioteca de elementos** (`/owner/skills/biblioteca`): se llega desde «Niveles y progresión» (`/owner/skills`), con el enlace «Biblioteca de elementos», que solo aparece si la biblioteca está disponible.
- **Plantillas de niveles** (`/owner/skills`): el botón «Añadir desde la biblioteca» al editar un nivel.
- **Guion de la sesión** (Pasar lista): el enlace opcional del bloque.
- **Superadministrador:** `/super-admin/biblioteca` (revisión de elementos por estado, incluidos los borradores, y la acción «Retirar») y `/super-admin/avisos` (bandeja de avisos sobre contenido).
- **Público:** `/avisos-de-contenido`, el formulario para avisar de un contenido que no debería estar. Solo existe con las tablas de la biblioteca instaladas; hasta entonces no hay enlace en el pie de página.

## Quién puede qué

| Rol | Buscar y ver fichas | Escribir la nota de la academia | Añadir desde la biblioteca en plantillas |
|---|---|---|---|
| Dirección, administración y coordinación | Sí | Sí | Sí |
| Entrenador/a | Sí | Sí | No: las plantillas las editan dirección, administración y coordinación |
| Familias | No | No | No |
| Superadministrador | Revisa todo, también los borradores, y retira | No | No |

- **Todos los planes, Free incluido** (decisión 10 de Elvis): no hay comprobación de plan. Con el plan en solo lectura se consulta todo, pero no se guardan notas.
- Todo se comprueba en el servidor dentro de la transacción de cada operación: bandera y tablas, miembro activo del equipo técnico, sede de su alcance y activa, y plan fuera de solo lectura en escrituras. El catálogo es global y de solo lectura (RLS `ENABLE` + `FORCE` y `REVOKE` a `anon` y `authenticated`): solo lo escriben las semillas y la acción «Retirar».
- **Qué ven las academias:** solo elementos revisados por Elvis, de una edición publicada y sin retirar. Los borradores solo los ve el superadministrador.

## De dónde salen los datos

La fuente de verdad son archivos revisados en el repositorio: `src/modules/element-library/data/<edición>/<aparato>.json`, con un aviso de autoría en cada archivo. Un script (`scripts/element-library/build-seed.ts`) genera una semilla SQL por tanda en `docs/deployment/candidates/`, y un test falla si el archivo y la semilla no coinciden.

Nada sale de Upgrade Gymnastics, de GymPro Atlas ni de las semillas antiguas.

### Procedimiento de cada tanda («sala limpia»)

1. **Hechos.** Se leen del PDF oficial solo número, grupo, valor, epónimo, página y un desglose técnico propio (forma del cuerpo, giros, dirección, entrada y salida). Ninguna frase del Código.
2. **Redacción en sala limpia.** Otra sesión, que no ve el Código, redacta nombre, nombre corto y descripción en español a partir solo de esos hechos: una o dos frases, con orden y extensión propios.
3. **Comprobación entre idiomas.** Una tercera sesión, que sí tiene el Código, compara cada descripción con el texto inglés. Lo que supera el umbral se vuelve a redactar desde los hechos.
4. **Revisión de Elvis.** Exactitud técnica de toda la tanda y comparación a mano con el Código de una **muestra del 10 %** (riesgo de traducción). Las descripciones no esperan a la respuesta del abogado a L10 (decisión 8 de Elvis): este procedimiento es la salvaguarda, y nunca se copia ni se traduce el texto del Código.
5. **Registro.** Cada tanda deja `src/modules/element-library/data/<edición>/tandas/<n>.json` con el procedimiento y su versión, las fechas, quién redactó («Claude»), el resultado de la comprobación, la muestra manual y quién revisó. Sin datos personales.

Las tandas son de unos 50 elementos. Orden (decisión 12 de Elvis): toda la artística femenina primero (salto, asimétricas, barra y suelo) y después la masculina.

### Primera tanda

- Edición `fig-wag-2025-2028`, salto, grupos 1 a 3: **51 elementos, revisados por Elvis el 19-11-2026**, sin correcciones.
- Registro: `src/modules/element-library/data/fig-wag-2025-2028/tandas/1.json`. Comprobación entre idiomas con umbral 0,5 y máximo 0,4; ningún elemento se volvió a redactar. Muestra manual: 6 elementos, sin resultado registrado.
- Semilla: `docs/deployment/candidates/20261119121000_element_catalog_seed_fig-wag-2025-2028_1.sql`, regenerada con la revisión. En staging está aplicada la versión anterior, en borrador; la revisada, pendiente. Sin aplicar en producción.

**Cuando Elvis la revisa,** se marca cada elemento como revisado con su fecha en el archivo de datos, se completa el registro de la tanda y se vuelve a generar la semilla. Una semilla nunca devuelve un elemento revisado a borrador, nunca deshace una retirada y aborta si un elemento revisado cambia sin una fecha de revisión posterior.

### Sexta tanda

- Edición `fig-wag-2025-2028`, barra de equilibrio, grupo 1 (entradas): **51 elementos, en borrador**. Es la primera tanda de barra; añade `beam.json` y no depende de las tandas de asimétricas.
- Registro: `src/modules/element-library/data/fig-wag-2025-2028/tandas/6.json`. Comprobación entre idiomas con umbral 0,5 y máximo final 0,45; se volvieron a redactar 16 elementos (8 por parecido y 8 por errores técnicos, uno de ellos en los hechos). Muestra manual: 6 elementos, pendiente de Elvis.
- Semilla: `docs/deployment/candidates/20261120033000_element_catalog_seed_fig-wag-2025-2028_6.sql`, sin aplicar.

### Séptima tanda

- Edición `fig-wag-2025-2028`, barra de equilibrio, grupos 2 (saltos, 37) y 3 (giros, 21): **58 elementos, en borrador**. Va encima de la sexta tanda, porque comparte `beam.json`.
- Los saltos a un pie caen en el mismo pie o en los dos, según la definición general del Código; donde la casilla no dice cómo cae, la ficha no lo dice.
- Registro: `src/modules/element-library/data/fig-wag-2025-2028/tandas/7.json`. Comprobación entre idiomas con umbral 0,5 y máximo final 0,45; se volvieron a redactar 27 elementos (12 por parecido y 15 por errores técnicos, la mayoría en los hechos). Muestra manual: 6 elementos, pendiente de Elvis.
- Semilla: `docs/deployment/candidates/20261120043000_element_catalog_seed_fig-wag-2025-2028_7.sql`, sin aplicar.

## Retiradas y avisos sobre contenido

- **Formulario público** `/avisos-de-contenido` (Reglamento de Servicios Digitales, art. 16), obligatorio antes de encender la bandera en producción. Pide motivo, dirección exacta, nombre, correo y una declaración de buena fe. Contra abusos: límite por IP y por correo, campo trampa, longitudes máximas y texto sin enlaces activos. No necesita cuenta ni depende de la bandera; sin las tablas, la página no existe y el envío a la API responde que no está disponible (503). El enlace «Avisar de un contenido» del pie de página se añade al instalar las tablas. **Un aviso no retira nada por sí solo.**
- **Bandeja del superadministrador** (`/super-admin/avisos`): estado («Recibido», «En revisión», «Cerrado»), respuesta y cierre.
- **«Retirar»** (`/super-admin/biblioteca`): el superadministrador retira un elemento con un motivo y, si lo hay, la referencia al aviso. Queda constancia en `public.audit_logs`. La retirada se guarda en la base y ninguna semilla la deshace. Las academias que lo tenían enlazado conservan su elemento con el aviso «Ya no está en la biblioteca».
- **Borrado a los 2 años** (decisión 14 de Elvis): el nombre y el correo de quien avisó se borran 2 años (730 días) después del cierre, con un trabajo diario (`/api/cron/content-notices-retention`, por lotes de 100). Su programación es la candidata `docs/deployment/scheduler/candidates/content-notices-retention.sql`, sin aplicar.

## Derechos de datos

- **Catálogo y retiradas:** categoría `shared_catalogs`, como `sport_profiles`; no son de ninguna academia.
- **Nota de la academia:** módulo opcional `element_library` de la exportación de la academia (`catalog_element_id` y `note`, con control exacto de columnas). Al borrar una integrante, la autoría queda en blanco; al borrar la academia, las notas se van en cascada.
- **Columnas de enlace** de `skill_elements` y `session_plan_blocks`, y la clave `catalogElementId` de los modelos de clase: se exportan solo si existen; el verificador acepta paquetes con y sin ellas.
- **Avisos sobre contenido:** tabla interna con datos personales de terceros, fuera del paquete de la academia y con su plazo de conservación (2 años desde el cierre).

## Uso habitual

Motivos para volver cada semana: la entrenadora enlaza elementos al preparar el guion y, al evaluar, ve la ficha y la nota de su academia; las notas forman la biblioteca técnica del club.

Se mide la consulta a la biblioteca con el evento `element_library_view`, contado por academia, rol y día, sin identificar a nadie y solo para el equipo. Necesita su propia candidata, `20261119121500_element_library_usage_event_candidate.sql`; sin ella, la biblioteca funciona igual y no cuenta. El resto de indicadores (academias con al menos una consulta por semana, elementos y bloques enlazados, notas por semana) se calcula con los datos.

## Orden de despliegue

Obligatorio (ADR-0029 §3.5), con un permiso de Elvis en cada paso y en cada entorno:

1. **Código primero.** Se publica el código que acepta los dos conjuntos de columnas (con y sin el enlace a la biblioteca) en niveles, guiones y derechos de datos, con las banderas apagadas. Niveles, guiones y exportación responden igual sin la migración.
2. **Candidatas, primero en staging y luego en producción**, en el orden del README de candidatas (`docs/deployment/candidates/README.md`, «Biblioteca de elementos (fase C): orden de aplicación y permisos»). Después de cada una, niveles y guiones siguen funcionando.
3. **Bandera.** Con todo aplicado y al menos una tanda revisada, encender `ZALTYKO_ELEMENT_LIBRARY_ENABLED` (con `ZALTYKO_SKILL_LEVELS_ENABLED`) y, aparte, si se quiere, la de descripciones.

Con la migración en todos los entornos, una PR posterior quitará el conjunto antiguo de columnas de las detecciones.

## Qué necesita de Elvis

| Fase | Bandera | Qué enciende | Qué necesita de Elvis |
|---|---|---|---|
| C | `ZALTYKO_ELEMENT_LIBRARY_ENABLED` (con `ZALTYKO_SKILL_LEVELS_ENABLED`) | Biblioteca con nombre, grupo y valor; nota de la academia; «Añadir desde la biblioteca»; enlace en el guion | Revisar las tandas; permiso para cada candidata y semilla por entorno; encender la bandera; aprobar el formulario de avisos |
| C | `ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED` | Descripciones propias | Revisar cada tanda; permiso para encenderla (no espera a L10) |
| D | `ZALTYKO_FEDERATION_LEVEL_TEMPLATES_ENABLED` | Importar plantillas de niveles de la RFEG | Solo hechos, sin licencia; revisar cada plantilla contra el PDF; permiso para el perfil `rfeg-2027` y la bandera |
| E | Ninguna aquí | Modelo por país | Su propio ADR |

Ninguna fase toca Stripe. Pedir licencias o escribir a la FIG son acciones externas que decide Elvis tras la revisión del abogado.

Pendiente ahora mismo de Elvis: el permiso para aplicar en staging la semilla revisada de la tanda 1 y la prueba en staging (buscar, añadir, evaluar, ver en el guion y retirar un elemento).

## Pruebas

- `tests/element-library-domain.test.ts` y `tests/element-library-data-files.test.ts`: límites del dominio, atribución, archivos de datos con esquema estricto, registro de cada tanda (con la muestra del 10 %) y semilla igual a lo que genera el script.
- `tests/element-library-contract.test.ts` y `tests/element-library-pg.test.ts`: candidatas, espejo Drizzle, RLS y `REVOKE`, banderas, hashes y, en PostgreSQL desechable, orden de instalación, semilla idempotente y retiradas que ninguna semilla deshace.
- `tests/element-library-routes.test.ts`, `tests/element-library-service-pg.test.ts` y `tests/element-library-ui.test.tsx`: búsqueda, ficha, nota de la academia con su revisión, roles, aislamiento entre academias, pie de atribución y ningún vídeo ni imagen en pantalla.
- `tests/element-library-usage-event-contract.test.ts` y `tests/element-library-usage-event-pg.test.ts`: el evento de consulta.
- `tests/content-notices-routes.test.ts`, `tests/content-notices-pg.test.ts` y `tests/element-withdrawal-pg.test.ts`: formulario de avisos (límites y campo trampa), bandeja, retirada y borrado a los 2 años.
- `tests/discipline-keys.test.ts`: la tabla única de equivalencias de disciplina.
- Niveles, guiones y derechos de datos (`tests/skill-levels-*.test.ts`, `tests/session-plans-*.test.ts`, `tests/data-rights-activated-modules-contract.test.ts` y los de exportación de la academia): aceptan los dos conjuntos de columnas y fallan cerrados ante cualquier otro.
