# ADR-0029 — Biblioteca de elementos y plantillas de niveles de federación

- Estado: **aceptado** el 19-11-2026 (revisión 3, con las decisiones de
  Elvis). No autoriza por sí solo migraciones, semillas, banderas,
  despliegues ni contactos con federaciones: cada uno necesita su permiso por
  entorno (§9).
- Fecha: 2026-11-19.
- Alcance: módulos `skill-levels` y `session-plans`, perfiles deportivos
  (ADR-0018), derechos de datos y uso habitual. Fases C (biblioteca) y D
  (plantillas RFEG), y la frontera con la fase E (modelo por país).
- Relacionados: ADR-0018; informe legal
  `documentacion/Zaltyko/legal/biblioteca-y-niveles-federativos.md` (veredictos
  y preguntas L8–L17) y `documentacion/Zaltyko/paises/modelo-comun.md`, ambos
  en la documentación interna, fuera de este repositorio. El informe legal es
  una investigación, no una opinión de abogado.

## Contexto

- **Los elementos son texto libre por academia.** `zaltyko.skill_elements`
  guarda nombre, aparato y descripción escritos a mano, y `session_plan_blocks`
  no enlaza elementos.
- **Las tablas de niveles y de guiones están en producción** (niveles desde el
  15-11-2026, con `ZALTYKO_SKILL_LEVELS_ENABLED=true`). Su detección de
  almacenamiento compara el conjunto **exacto** de columnas y falla cerrada:
  `skill-levels/application/skill-levels/storage.ts:93-98`,
  `session-plans/application/session-plan/storage.ts:31-44` y las
  `expectedColumns` de `data-rights/application/catalog.ts:658-685`. Una
  columna nueva sin código preparado deja ambas funciones en 503 y rompe la
  exportación.
- **Las plantillas genéricas no citan federaciones sin fuente verificada**
  (`tests/skill-levels-domain.test.ts:227-236`; §4 y decisión 7 de
  `docs/producto/niveles-y-progresion.md`). La fase D permite datos RFEG que
  cumplan el resumen legal y mantengan la atribución visible.
- **Informe legal (19-11-2026).** Nombre, aparato, grupo y valor son hechos; el
  texto y los dibujos del Código de Puntuación no (veredictos 1, 1b, 5, 6c).
  RFEG de solo hechos: con condiciones (2); con texto o ilustraciones: abogado
  o licencia (2b). FMG con rutinas USAG: no (3); su esqueleto: abogado (3b).
  Upgrade: no (4). YouTube oficial: con condiciones (6); clips ajenos: no (6b).
- **Claves de disciplina distintas** en cuatro módulos (decisión 5).
- **Tres fuentes sobre la RFEG**, ninguna fiel a la normativa: `catalog.ts`
  (`rfeg-2026-v2`), las semillas de `src/db/seeds/templates/` («RFEG
  2022-2024», «Elementos oficiales FIG 2022-2024») y los perfiles `ES/artistic`
  y `ES/rhythmic`, solo `identity_only`.
- **Tablas antiguas con consumidores vivos** (decisión 7).

## Decisión

### 1. Catálogo global de elementos, de solo lectura

1. **Tablas.** Dos tablas globales en `zaltyko`, sin `organization_id`:
   - `catalog_element_editions`, una fila por disciplina y ciclo: `code`
     (`fig-wag-2025-2028`, `fig-mag-2025-2028`), `discipline`, `cycle_start`,
     `cycle_end`, título y URL HTTPS del documento, fecha de portada y `status`
     (`draft`, `published`, `retired`). Las fechas de portada (GAF 14-10-2026,
     GAM 14-04-2025) **se toman del informe legal** y se vuelven a comprobar en
     el PDF al crear la edición.
   - `catalog_elements`, una fila por elemento y edición:
     - `element_key`, clave propia, estable entre ediciones
       (`^[a-z][a-z0-9_]{2,63}$`);
     - `discipline` (`artistic_female`, `artistic_male`), `apparatus` (claves
       de `SKILL_APPARATUS`) y `element_group` (lista cerrada por edición);
     - `value_letter` (`A`–`J`) o `value_points` (solo salto), exactamente uno;
     - `fig_reference`, opcional y solo como referencia: no es clave ni ordena;
     - `name` (2–100) y `short_name` (≤ 40), en español; los epónimos se
       conservan como nombre técnico («Tsukahara»);
     - `description` (≤ 300), opcional (punto 7);
     - procedencia: `source_page`, `source_checked_on`, `drafted_by`,
       `drafted_on` y `batch` (tanda);
     - `review_status` (`draft` = «borrador», `reviewed` = «revisado por
       Elvis») con `reviewed_on`, y `withdrawn_at` con `withdrawn_reason`.
2. **Sin imágenes.** Ni columnas de imagen ni URL de terceros. Pictogramas
   propios solo en otro ADR, dibujados desde cero con cesión de derechos (6c).
3. **Solo lectura.** RLS `ENABLE` + `FORCE` y `REVOKE` a `anon` y
   `authenticated`. Solo escriben las semillas y la acción «Retirar».
4. **Clase de datos.** `EXCLUDED_CANONICAL_TABLES`, categoría
   `shared_catalogs`, como `sport_profiles`.
5. **Carga.** La fuente de verdad son archivos revisados en el repositorio
   (`src/modules/element-library/data/<edición>/<aparato>.json`, esquema zod
   estricto). Un script genera una semilla por tanda
   (`docs/deployment/candidates/<ts>_element_catalog_seed_<edición>_<tanda>.sql`)
   y un test falla si archivo y semilla difieren. El upsert por
   `(edition, element_key)` **nunca escribe** `withdrawn_at` ni
   `withdrawn_reason` (una retirada sobrevive a cualquier semilla), solo mueve
   `review_status` de `draft` a `reviewed`, y aborta si un elemento revisado
   cambia sin un `reviewed_on` posterior. Las tablas las crea otra candidata,
   `<ts>_element_library_candidate.sql`.
6. **Qué ven las academias.** Solo elementos `reviewed`, de una edición
   `published` y sin `withdrawn_at`. Los borradores, solo la página de revisión
   del superadministrador.
7. **Descripciones: las redacta Claude y las revisa Elvis.** Condiciones:
   - se redactan **solo a partir de hechos estructurados**: nombre, aparato,
     grupo, valor y un desglose técnico propio (forma del cuerpo, giros,
     dirección, agarre, entrada y salida). El texto del Código **no está** en
     la instrucción ni en el contexto de la sesión que redacta;
   - una o dos frases, con orden y extensión propios;
   - **comprobación antes de la revisión** por otra sesión que sí tiene el
     Código: similitud entre idiomas con el texto inglés (embeddings
     multilingües o comparación frase a frase); lo que supere el umbral se
     vuelve a redactar desde los hechos;
   - Elvis revisa la exactitud técnica y, como mínimo, compara a mano con el
     Código una muestra del 10 % de cada tanda (riesgo de traducción). Las
     descripciones **no esperan a la respuesta del abogado a L10** (decisión
     de Elvis): este procedimiento es la salvaguarda, y nunca se copia ni se
     traduce el texto del Código;
   - cada tanda deja un registro en
     `src/modules/element-library/data/<edición>/tandas/<n>.json`:
     procedimiento y versión, fechas, quién redactó («Claude»), resultado de
     la comprobación, muestra manual y quién revisó. Sin datos personales.

   **Enmienda (23-11-2026, decisión de Elvis: «revísalo todo tú»).** La
   revisión técnica y la muestra manual del 10 % las puede hacer Claude por
   delegación de Elvis, con estas condiciones: las hace una sesión distinta de
   la que redacta, con el Código oficial de la FIG delante (texto y dibujos);
   las correcciones vuelven al redactor como hechos, nunca como texto del
   Código, y pasan otra vez la comprobación de similitud; el registro de la
   tanda dice `reviewedBy: "Claude"`. Elvis puede revisar después cualquier
   tanda y su revisión sustituye a la delegada.

   Nada sale de Upgrade Gymnastics, de GymPro Atlas ni de las semillas
   antiguas.
8. **Atribución.** Pie fijo en la biblioteca y en cada ficha (§7.3 del
   informe): «Valores y grupos según el Código de Puntuación […] de la FIG
   (World Gymnastics), edición […]. Las descripciones las redacta Zaltyko y no
   son el texto oficial; si hay diferencias, manda el documento oficial:
   [enlace]. Zaltyko no está afiliado a la FIG ni cuenta con su respaldo.» FIG
   y RFEG, solo en texto y sin logos. Los epónimos no se usan en publicidad,
   SEO ni campañas (L14).

### 2. Lo que añade cada academia

1. **Tabla.** `zaltyko.academy_element_notes`, una fila por academia y elemento
   (`unique (organization_id, catalog_element_id)`): `note` (≤ 500),
   `revision`, autoría (`on delete set null`) y fechas. RLS `ENABLE` +
   `FORCE` y `REVOKE`. **Sin columnas de vídeo.**
2. **Quién.** La escriben la dirección y las entrenadoras y la lee todo el
   equipo. Las familias no ven la nota en esta fase.
3. **Sin vídeo** (decisión de Elvis). La biblioteca no muestra ni guarda
   vídeos, ni enlaces de YouTube, en esta versión. Si se quiere más adelante,
   irá en un ADR propio, después de que el abogado responda L15 (YouTube
   incrustado en un SaaS de pago) y L16 (vídeos con menores), con las
   condiciones del informe (§6).
4. **Derechos de datos.** Módulo opcional `element_library` en
   `OPTIONAL_INCLUDED_EXPORT_MODULES` (`catalog_element_id`, `note`,
   columnas exactas). Supresión:
   autoría a nulo al borrar una integrante; cascada al borrar la academia.

### 3. Enlaces opcionales con lo que ya existe

1. **`skill_elements.catalog_element_id`**: `uuid` nulo, FK a
   `catalog_elements(id)` `on delete restrict`. El nombre sigue siendo
   obligatorio y de la academia; «Añadir desde la biblioteca» lo rellena y se
   puede cambiar. El servicio exige que aparato y disciplina coincidan con el
   elemento. Copiar una plantilla copia el enlace.
2. **`session_plan_blocks.catalog_element_id`**: igual. Como máximo un
   elemento por bloque, con `discipline` y `apparatus` coherentes (decisión 5);
   el contenido sigue siendo texto libre obligatorio.
3. **`class_plan_templates.blocks`** admite la clave opcional
   `catalogElementId`, que se añade a la clasificación de data-rights y al
   verificador (hoy aceptan solo `kind`, `discipline`, `apparatus`, `content` y
   `durationMinutes`). Si el elemento ya no está visible al crear el guion, el
   bloque se copia sin enlace.
4. **Datos existentes.** Columnas nulas, sin valor por defecto ni reescritura;
   sin relleno automático ni emparejamiento por nombre. Progreso, pasos de
   nivel, diplomas y guiones no cambian. El verificador acepta archivos con y
   sin la columna.
5. **Orden de despliegue obligatorio** (ver «Validación requerida»): (1) se
   publica el código que acepta **los dos** conjuntos de columnas, el actual y
   el nuevo, en las detecciones de `skill-levels` y `session-plans` y en las
   `expectedColumns` de data-rights, que exportan la columna solo si existe;
   (2) se aplica la migración, en staging y luego en producción; (3) se
   enciende la bandera. Con la migración en todos los entornos, una PR
   posterior retira el conjunto antiguo.
6. **Elemento retirado o de edición anterior.** El enlace se conserva y se ve
   el nombre de la academia con el aviso «Ya no está en la biblioteca» o
   «Edición anterior». Si la edición nueva tiene el mismo `element_key`, se
   ofrece «Actualizar enlace», nunca automático.

### 4. Plantillas de niveles de federación

1. **Dónde viven.** En datos JSON versionados por edición:
   `src/modules/skill-levels/data/federation/rfeg-2026/{gaf,gam}.json`.
   La clave de disciplina es `artistic_female` o `artistic_male`. La
   importación crea una copia de academia; no importa material FMG.
2. **Contenido.** Cada fichero declara federación, documento, edición, fecha
   del documento y fecha de consulta. Incluye URL oficial solo si se verifica;
   en el lote inicial solo se conserva el nombre del documento porque la URL
   no se confirmó sin navegar. Los niveles siguen el orden oficial, con
   referencias de página y hechos breves redactados en palabras propias.
   `elementKey` solo se rellena con coincidencia inequívoca y puede quedar nulo.
3. **Importación y copias.** `skill_templates.source` admite `federation`.
   No se añaden columnas en esta fase: la atribución se conserva en la
   descripción de la copia y en la cita de cada requisito. La candidata
   `20261124134300_skill_template_federation_source_candidate.sql` amplía el
   CHECK existente y no está aplicada.
   - El CHECK vigente de `starter_key` se mantiene sin cambios.
   - **Copiar** conserva la descripción y las citas con página, por lo que la
     atribución se arrastra a las copias de academia.
   - La academia puede editar la copia. La plantilla oficial de código no se
     modifica al importar.
   - Cada elemento o condición factual se guarda como una entrada separada. El
     límite por nivel sube de 40 a 64 para admitir la plantilla GAM Base 2
     (60 entradas); el máximo de 300 por plantilla no cambia. El tope de
     elementos por envío de evaluación también sube a 64; el máximo conjunto de
     400 marcas por envío se mantiene. No requiere una migración.
   - «Solo hechos» se garantiza en los archivos del código, no en lo que la
     academia escriba después, y es aceptable: la academia es autora de sus
     cambios.
4. **Cómo se muestra.** En la selección y en la copia figura «Fuente: RFEG,
   [documento], pág. N». En la copia se recuerda que debe consultarse siempre
   el documento oficial y que Zaltyko no está afiliado a la RFEG. El PDF no se
   incrusta. La URL oficial queda pendiente de verificación.
5. **Solo hechos (2 y 2b).** No se copian texto, dibujos ni secuencias. Se
   conservan nombres de nivel y aparato, referencias de página y hechos breves
   propios. La prueba anti-copia compara secuencias de ocho palabras con las
   extracciones locales del PDF.
6. **RFEG primero:** GAF Base 1–10 y GAM Base 1–5, edición 2026, vigente hasta
   el 31-12-2026 según los documentos disponibles. La edición 2027 queda
   pendiente de obtener y revisar su PDF; después se estudiará Vía Olímpica.
7. **FMG bloqueada (3 y 3b).** La Pirámide GAF usa rutinas y el código JO de
   USA Gymnastics, que prohíbe resúmenes y adaptaciones sin permiso escrito.
   El esqueleto espera al abogado (L11, L12) o a una licencia de la FMG o de
   USAG; GAV y GR también, porque no se sabe qué parte es propia. Mientras, las
   academias mexicanas usan la biblioteca y sus plantillas propias.
8. **Regla del test: «solo con fuente verificada y sin texto reproducido».**
   - La comprobación actual sigue para `STARTER_TEMPLATES`.
   - `tests/skill-levels-federation-data.test.ts` valida orden, metadatos,
     páginas, aparato y disciplina de cada `elementKey`, bandera apagada por
     defecto y ausencia del texto genérico de relleno.
   - **Sin texto reproducido:** la persona que prepara la edición extrae el
     texto de los PDF locales con `pdftotext` y pasa las rutas fuera del
     repositorio mediante `RFEG_GAF_TEXT_PATH` y `RFEG_GAM_TEXT_PATH`. El test
     compara todos los textos de la ficha con secuencias normalizadas de ocho
     palabras; nombres de elementos breves no alcanzan ese umbral. Si esas
     variables no están definidas, la comprobación se omite; si se definen y la
     extracción no existe, el test falla.

### 5. Una sola tabla de equivalencias de disciplina

La clave canónica es la de `skill-levels`. No se renombra ninguna columna con
datos: un módulo puro, `src/modules/shared/domain/discipline-keys.ts`, convierte
en los bordes.

| Concepto | Canónica (`skill-levels`) | `sport_profiles.discipline_key` | `session-plans` | `athlete-progress` | `catalog.ts` |
|---|---|---|---|---|---|
| GAF | `artistic_female` | `artistic` | `gaf` | `gaf` | `artistic` + `female` |
| GAM | `artistic_male` | `artistic` | `gam` | `gam` | `artistic` + `male` |
| GR | `rhythmic` | `rhythmic` | `gr` | (no la admite) | `rhythmic` + `individual_group` |
| Manos libres | `body` | — | `freehand` | — | `free_hands` |
| Aparatos de artística | `vault`, `uneven_bars`… | — | los mismos | los mismos | `vt`, `ub`, `bb`, `fx`, `ph`, `sr`, `pb`, `hb` |

- Hacia `sport_profiles` la conversión es total; al revés es **parcial**,
  porque ni el perfil ni `organization_sports` tienen columna de rama. La rama
  sale siempre del propio objeto (la disciplina de la plantilla, del bloque o
  del archivo de federación).
- Sin respuesta (`gr` hacia `athlete-progress`, o `artistic` sin rama), la
  función devuelve `null`: el llamador no enlaza ni supone, y la pantalla pide
  elegir la disciplina. Los CHECK existentes no cambian.

### 6. Modelo por país: qué cubre este ADR y qué deja

- **Cubre** plantillas con versión, vigencia y fuente ligadas a un perfil
  `verified`, aparato por elemento y catálogo por ciclo. **Deja para otro ADR
  (fase E):** temporada, fecha de referencia de la edad y periodo de licencia;
  nivel × banda de edad y nivel por aparato; programas paralelos excluyentes;
  aparatos de rítmica por categoría y año; tipos de regla de ascenso; capa
  autonómica; categoría por circuito; semillas `MX:*`.
- **Avisos.**
  - El fin de `rfeg-2026-v2` el 31-12-2026 **no lo aplica el código** (que no
    guarda vigencia): viene de las fechas de la normativa 2026, que rige el año
    natural. `rfeg-2027` es una PR aparte, mejor antes del 1-01-2027.
  - `catalog.ts` no coincide con la RFEG (GR con «Pre-nivel» y «Nivel 1–4 +
    FIG»; GAF con edades en `levelOptions`; topes de GAM B4 y B5 en 2027) ni
    con la FMG (México cae en el genérico). Hasta la fase E, los niveles RFEG
    2027 salen de la fase D, y un test los compara con los códigos `ES:*`.

### 7. Retirada de las tablas antiguas y de las puntuaciones antiguas

1. **Consumidores actuales:** `public.assessment_scores.skill_id` es `NOT
   NULL` con FK a `skill_catalog` (`src/db/schema/assessment-scores.ts:14-16`);
   lo escriben `POST /api/assessments` (`route.ts:211-216`) y
   `/api/assessments/[athleteId]` (`:215`), que además lo lee con un
   `leftJoin`; lo recoge `src/components/assessment-form.tsx:41,68`;
   `scripts/seed.ts:6-9,822-826` llama a las cuatro semillas y a
   `seedSkillCatalog`; `scripts/lib/local-build-trace-catalog.ts:1472-1475`
   las lista; y las nombran los tests `athlete-skills-schema-contract`,
   `new-table-rls-contract`, `rls-consolidated-new-tables-contract` y
   `ci-isolated-workflow-contract`, `scripts/ci/sandbox-tenant-isolation.sql`
   y la migración `20260915110000`.
2. **Puntuaciones antiguas: se quitan.** Ninguna página importa
   `AssessmentForm` ni `AthleteStatsOverview`, y `/app/.../assessments`
   redirige a `/owner`. La PR de retirada quita el formulario, las escrituras
   y lecturas de `assessment_scores` en las dos rutas (responden 400 si llegan
   `scores`), las semillas con sus llamadas y entradas de trazas, y los tests
   afectados. `athlete_assessments` y los vídeos de evaluación quedan para otra
   limpieza.
3. **Candidata destructiva aparte**,
   `<ts>_retire_legacy_skill_catalog_candidate.sql`, con el patrón de
   `20261114120000_retire_legacy_health_data_candidate.sql`: cuenta las filas
   de `athlete_skills`, `skill_catalog` y `assessment_scores`, aborta si hay
   alguna y, si no, borra las tres tablas. Cada entorno, con permiso.
4. **Si aborta porque hay filas:** no se borra nada. Se informa a Elvis del
   recuento por tabla y academia; las tablas se quedan sin código que las use
   (ya lo garantiza la PR); Elvis decide exportarlas o conservarlas, y solo
   entonces se escribe otra candidata.

### 8. Retiradas, avisos y respuesta a titulares

1. **Formulario público de avisos** (Reglamento de Servicios Digitales, art.
   16), obligatorio antes de encender la bandera en producción. Pide los
   campos del art. 16.2 (motivo, URL exacta, nombre, correo, declaración de
   buena fe). **Contra abusos:** límite por IP y por correo
   (`src/lib/rate-limit.ts`), campo trampa, longitudes máximas, texto sin
   enlaces activos; un envío no retira nada por sí solo.
2. **Registro de avisos** (§7.4.3 del informe): tabla interna
   `zaltyko.content_notices` (recepción, remitente, contenido señalado,
   motivo, estado, respuesta, cierre). Nombre y correo se borran **2 años
   después del cierre** con un trabajo programado. En data-rights, tabla
   interna con datos personales de terceros, fuera del paquete de la academia
   y con su plazo de conservación.
3. **Acción «Retirar»** del superadministrador, con motivo, referencia al
   aviso y constancia en `audit_log`:
   - **elemento:** `withdrawn_at` en la base, que ninguna semilla deshace;
   - **plantilla de federación:** fila en `zaltyko.content_withdrawals`
     (`kind`, `key`, `withdrawn_at`, `reason`, `notice_id`; `shared_catalogs`)
     que el código lee: la importación desaparece al momento, sin redesplegar,
     y el archivo se borra del código en los 7 días siguientes;
4. **Copias ya importadas.** Las academias las conservan, porque son suyas.
   Mientras la clave esté en `content_withdrawals`, la cabecera oculta el
   enlace y dice «Fuente retirada de Zaltyko el […]; consulta el documento
   oficial a tu federación». Los `source_*` se conservan como historial.
5. **Si la RFEG pide la retirada.** Las plantillas de solo hechos se publican
   sin licencia (veredicto 2, decisión de Elvis); por ahora no se pide. Si pide retirarlas, se retiran al momento (punto 3) y pasa
   al abogado. Si pide también quitar las copias, archivarlas (`archived_at`)
   con aviso previo a cada academia es una operación puntual que decide Elvis.
   La respuesta tipo para FIG, RFEG, USAG y academias está lista antes de
   lanzar.

### 9. Banderas, fases y qué necesita cada una de Elvis

Apagadas por defecto. Sin bandera o sin tablas, la función no existe (404/503).

| Fase | Bandera | Qué enciende | Qué necesita de Elvis |
|---|---|---|---|
| C | `ZALTYKO_ELEMENT_LIBRARY_ENABLED` (con `ZALTYKO_SKILL_LEVELS_ENABLED`) | Biblioteca con nombre, grupo y valor; nota; «Añadir desde la biblioteca»; enlace en el guion | Aprobar el ADR; revisar tandas; permiso para cada candidata y semilla por entorno; encender la bandera; aprobar el formulario de avisos |
| C | `ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED` | Descripciones propias | Revisar cada tanda; permiso para encenderla (no espera a L10) |
| D | `ZALTYKO_FEDERATION_LEVEL_TEMPLATES_ENABLED` | Importar plantillas RFEG | Solo hechos, sin licencia; revisar cada plantilla contra el PDF; permiso para el perfil `rfeg-2027` y la bandera |
| E | Ninguna aquí | Modelo por país | Su propio ADR |

Ninguna fase toca Stripe. Pedir licencias o escribir a la FIG son acciones
externas que decide Elvis tras la revisión del abogado (§7.1 del informe).

### 10. Fuera de alcance

La rítmica en la biblioteca; el análisis de pose o de vídeo; cualquier dato,
imagen o selección de vídeos de GymPro Atlas o de Upgrade Gymnastics; imágenes
de terceros y pictogramas en la primera versión; cualquier vídeo o enlace de
vídeo por elemento; la biblioteca en
el portal de familias; las plantillas autonómicas y de la FMG; los enlaces
desde los objetivos.

### 11. Uso habitual

- **Motivos para volver cada semana:** la entrenadora enlaza elementos al
  preparar el guion y, al evaluar, ve la ficha y la nota de su academia; las
  notas forman la biblioteca técnica del club; el resumen semanal puede contar
  elementos conseguidos por aparato (`athlete_skill_progress.achieved_on`).
- **Qué se mide** (contadores por academia, rol y día, sin identificar a nadie):
  consultas a la biblioteca (`element_library_view`), academias con al menos
  una por semana, porcentaje de elementos nuevos y de bloques enlazados, notas
  por semana, y plantillas RFEG importadas con alguna evaluación en 14 días.
  Todo salvo la consulta se calcula con los datos.
- **El evento tiene su propia candidata pequeña** que amplía
  `usage_events_event_name_check`, con un preflight que aborta si
  `to_regclass('public.usage_events')` es nulo (`20261114130000` puede no
  estar en todos los entornos). Sin la restricción nueva, la biblioteca
  funciona sin contar.

## Consecuencias

- Vocabulario común sin perder el texto libre; lo que existe no cambia.
- El catálogo queda atado a un ciclo (2029–2032 será otra edición, con enlaces
  que se actualizan a mano), y cada edición anual de una federación es un
  archivo, una revisión y una semilla de perfil.
- Elvis revisa varios cientos de fichas; datos y descripciones quedan en un
  repositorio público.
- Al aprobarse hay que actualizar el glosario: «biblioteca», «plantilla de
  niveles de la federación», y limitar a las plantillas de ejemplo la
  prohibición de nombrar federaciones.

## Validación requerida

- **Orden de despliegue, comprobado en staging:** (1) código que acepta los
  dos conjuntos de columnas, con banderas apagadas: niveles, guiones y
  exportación responden 200 sin la migración; (2) migración: siguen en 200;
  (3) bandera. En producción, igual, con un permiso por paso.
- Test de las detecciones de `skill-levels`, `session-plans` y data-rights con
  los conjuntos antiguo y nuevo, y fallo cerrado ante cualquier otro.
- Preflight de `public.usage_events` en la candidata del evento (aborta sin la
  tabla); candidatas sobre PostgreSQL limpio y sobre una base con datos.
- RLS `ENABLE` + `FORCE` y `REVOKE` en las tablas nuevas, y aislamiento entre
  academias en `academy_element_notes`.
- Semilla igual al archivo e idempotente; recargarla no deshace una retirada
  ni devuelve un `reviewed` a `draft`.
- Contrato de data-rights: catálogo y retiradas en `shared_catalogs`;
  `element_library`; columnas nuevas; `catalogElementId`; `content_notices`
  con su plazo; supresión.
- Servicio: disciplina y aparato del enlace; conversión parcial que devuelve
  `null`; copia de una plantilla de federación con atribución y etiqueta
  «modificada»; cabecera no editable; plantilla retirada (la importación
  desaparece y la copia se marca).
- `tests/federation-templates.test.ts`, plantillas de inicio,
  `discipline-keys.ts` y coherencia de los niveles `ES:*`.
- Registro de cada tanda completo antes de su semilla; límite de envíos y
  campo trampa en el formulario de avisos.
- Prueba en staging, con permiso: buscar, añadir, evaluar y ver en el guion;
  importar una plantilla RFEG; retirar un elemento y una plantilla.
- Revisión independiente del diff y CI en verde (runs completados del head
  SHA, no un `gh pr checks` vacío).

## Decisiones de Elvis

Tomadas el 19-11-2026:

1. Biblioteca con artística femenina y masculina; la rítmica, después.
2. Las descripciones las redacta Claude y las revisa Elvis por tandas.
3. Países investigados a fondo (hecho, en `documentacion/Zaltyko/paises/`).
4. Nada de datos de Upgrade Gymnastics ni de imágenes de terceros.
5. Plantillas de federación: primero la RFEG, después la FMG.
6. Cada paso en producción (migración, bandera, Stripe Live), con permiso
   expreso.

Tomadas también el 19-11-2026, sobre las preguntas de este ADR:

7. **Plantillas RFEG:** se publican ya, solo con hechos (niveles, aparatos,
   elementos exigidos, valores y la página del documento oficial), sin pedir
   licencia por ahora. Las academias las copian y las adaptan para crear las
   suyas. Copiar el texto tal cual se descartó: el texto y las ilustraciones
   de la RFEG y las descripciones de la FIG tienen derechos de autor, y
   adaptarlas después seguiría siendo obra derivada (veredicto 2b).
8. **Descripciones propias:** salen sin esperar a L10, con el procedimiento
   del §1.7.
9. **Sin vídeo** en esta versión (§2.3).
10. **Todos los planes**, Free incluido.
11. **Datos en el repositorio público**, con aviso de autoría en cada archivo.
12. **Orden de las tandas:** toda la artística femenina primero (salto,
    asimétricas, barra y suelo) y después la masculina, en tandas de unos 50
    elementos.
13. **Retirada de las puntuaciones antiguas por elemento:** sí, primero en
    staging y después de la fase C; si la candidata aborta por haber datos, se
    decide con el recuento en la mano.
14. **Avisos de retirada:** el nombre y el correo de quien avisa se guardan 2
    años desde el cierre y después se borran.
