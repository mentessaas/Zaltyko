# Importar gimnastas desde Excel o CSV (O4)

Fecha: 11 de noviembre de 2026; revisado el mismo día tras la primera revisión (6,5/10). Matriz competitiva (`docs/research/competencia/matriz-competitiva.md`), O4: «Importación de Excel con vista previa + migración asistida». RG Manager, OneClub, Clybo y FlipBiz anuncian importación; en el flujo canónico de `/owner` no había ninguna. Este documento cubre el importador mínimo. La migración asistida, es decir la llamada de 30 minutos, es proceso y no código.

Objetivo: que una academia que vive en Excel pase sus gimnastas, sus tutores y sus grupos a Zaltyko sin teclearlos uno a uno, viendo antes de guardar qué se va a crear, qué no y por qué.

**Importante.** No hay migración. La función queda activa en zaltyko.com en cuanto se fusione la PR y escribe datos de menores. Por eso las reglas son las más conservadoras y siguen al alta manual.

## Recorrido

1. **Gimnastas → «Importar desde Excel o CSV»** (`/owner/athletes/import`). Solo lo ven la propiedad y la administración con todas las sedes.
2. **Plantilla.** Se puede bajar en CSV (separado por `;`, con BOM UTF-8) o en Excel (.xlsx). Solo trae los títulos en español; no hay fila de ejemplo que pueda importarse por error.
3. **Fichero.** Se sube un CSV o un `.xlsx`. Del Excel se lee la primera hoja.
4. **Vista previa.** No escribe nada y tiene tres partes:
   - **Columnas.** Se asignan solas por el título, sin distinguir mayúsculas ni tildes y con sinónimos frecuentes. Cada asignación se puede cambiar con un desplegable. Si falta una columna obligatoria o se repite una, se explica y no se muestran filas.
   - **Resumen.** Indica cuántas gimnastas, familias, tutores y altas en grupo se crearán, y cuántas filas tienen errores, están duplicadas o no se importan. Muestra también el uso y el límite del plan.
   - **Filas.** Una tabla con el resultado de cada fila («Se crea», «Error», «Duplicada» o «No se importa») y sus errores y avisos en español. La acompañan:
     - un glosario breve, «Qué significa cada resultado»;
     - el aviso de las filas ocultas o filtradas del Excel, que no se importan;
     - «Descargar filas a revisar», un CSV seguro frente a fórmulas.
5. **Declaración obligatoria.** «Declaro que tengo base legal para tratar estos datos y que he informado a las familias». Sin marcarla, el botón no se activa y la ruta responde 400. La auditoría guarda que se marcó.
6. **Importar N gimnastas.** Crea todas las filas válidas en una sola transacción y muestra cuántas se crearon y qué filas se saltaron, con su motivo.

## Columnas y reglas

Las reglas son las mismas que las del alta manual y el editor de contactos; no hay reglas nuevas.

| Columna | Obligatoria | Regla |
|---|---|---|
| Nombre, Apellidos | Sí | Hasta 100 caracteres. No pueden empezar por `=`, `+`, `-`, `@`, `\|`, tabulador ni sus variantes de ancho completo (`＝`, `＋`, `－`, `＠`, `｜`). |
| Fecha de nacimiento | No, como en el alta manual | `DD/MM/AAAA` (también con `-` o `.`) o `AAAA-MM-DD`; en Excel vale una celda de fecha, también con el sistema de fechas 1904. El año va con cuatro cifras. No puede ser futura ni anterior a 1900. Sin fecha, la fila lleva un aviso y los duplicados se comparan solo por nombre. |
| Grupo | No | Nombre de un grupo activo de una sede activa de la academia, sin distinguir mayúsculas ni tildes. Si no existe o hay dos con ese nombre, la fila da error. |
| Nombre y apellidos del tutor | Si hay tutor | Si solo hay «Nombre del tutor» con varias palabras, la primera se toma como nombre y el resto como apellidos, con aviso. |
| Email del tutor | No | La misma validación que el editor de contactos (`z.email()`, hasta 254 caracteres, en minúsculas). |
| Teléfono del tutor | No | La misma regla que el editor: E.164 tal cual, `+34600000000`. No se quitan espacios ni se adivina el prefijo. |
| Parentesco | No | Madre o padre, tutor legal, acogida u otro. Si está vacío se registra madre o padre; si no se reconoce, «otro». Ambos casos dan aviso. |

## Qué se crea por cada fila válida

- **La gimnasta:** su ficha, con la fecha de nacimiento si la hay, y su registro de gimnasta.
- **Su familia** y el vínculo gimnasta–familia. El vínculo empieza en la fecha local de la sede del grupo; sin grupo, en la de la primera sede activa de la academia.
  - Las hermanas con el mismo email o teléfono de tutor, **y el mismo nombre de tutor**, comparten una familia nueva.
  - **Tutor existente:** se reutiliza su familia solo si coinciden su email o su teléfono **y** su nombre normalizado, y el tutor tiene **una** familia activa.
  - **Errores de fila, nunca una elección:**
    - el contacto lo comparten varios tutores activos;
    - el email y el teléfono son de tutores distintos;
    - el contacto coincide pero el nombre no;
    - el tutor tiene varias familias o ninguna.
- **El tutor nuevo**, si la fila lo trae: su persona, el registro de tutor, el vínculo con la familia y su email y teléfono principales.
- **El alta en el grupo**, si la fila lo trae: activa desde la fecha local de la sede, con su historial. Si el grupo se llena, la fila siguiente no se importa.
- **Sin grupo**, la gimnasta queda en la bandeja de Gimnastas sin asignar, igual que con el alta manual.

No se crea pagador ni inscripción en clases, igual que en el alta manual. La familia queda «incompleta» hasta elegir un pagador desde el flujo de siempre.

## Criterio de duplicados

Es conservador: ante la duda, la fila no se importa. Siempre se compara dentro de la academia, con el nombre y los apellidos sin mayúsculas, tildes ni signos, en cualquier alfabeto.

| La fila | Choca con | Resultado |
|---|---|---|
| tiene fecha | una gimnasta de la academia con el mismo nombre y la misma fecha, también archivada | Duplicada; si está archivada, el aviso pide reactivarla |
| tiene fecha | una gimnasta de la academia con el mismo nombre y **sin** fecha | Duplicada (posible) |
| no tiene fecha | cualquier gimnasta de la academia con el mismo nombre | Duplicada (posible) |
| cualquiera | una fila anterior del fichero con el mismo nombre y la misma fecha, o alguna de las dos sin fecha | Duplicada |

Dos hermanas con el mismo nombre y la misma fecha (gemelas homónimas) no se distinguen. Hay que crear la segunda a mano.

## Quién puede importar

Exactamente como el alta manual: **la propiedad (`owner`) o la administración (`admin`) con acceso a todas las sedes**. Se comprueba en cuatro sitios:
- la página;
- la entrada de las rutas, antes de leer el cuerpo;
- la vista previa;
- la confirmación, dentro de su transacción.

La coordinación, el entrenador y cualquier rol con sedes limitadas reciben 403. Así tampoco se revela la existencia de gimnastas o grupos de otras sedes.

## Límites y seguridad

- **Plan.** Se crean filas en el orden del fichero hasta el límite (por ejemplo, Free: 30 gimnastas) y las demás salen como «No se importa». La confirmación vuelve a calcularlo bajo el bloqueo de la organización.
- **Solo lectura.** Si la academia supera su plan, la vista previa lo avisa y la confirmación responde `PLAN_OVER_CAPACITY` sin escribir nada.
- **Fichero:**
  - **Tamaño:** máximo 2 MB, 1.000 filas de datos y 50 columnas.
  - **Filas:** se cuentan **filas lógicas**. Una celda de varias líneas es una fila y las filas vacías no cuentan. No se recorta nada en silencio: con más de 1.000 filas se rechaza el fichero entero, con el número de filas.
  - **Dónde se lee:** en memoria en el servidor, sin guardar nada en disco ni en almacenamiento.
  - **Tipo:** se decide por el contenido. Un ZIP es XLSX y lo demás es CSV en UTF-8 o Windows-1252, con `;`, `,` o tabulador. Los `.xls` antiguos se rechazan.
  - **Bomba ZIP.** Antes de abrir un XLSX se leen las cabeceras del ZIP y se rechaza si declara más de 20 MB descomprimidos, más de 1.000 entradas o ZIP64. Solo se procesa la primera hoja y solo se recorren las celdas que existen, sea cual sea el rango que declare la hoja.
  - **Filas ocultas o filtradas** del Excel: no se importan y la vista previa dice cuáles son.
- **Fórmulas:**
  - **No se evalúan nunca.** Del XLSX se lee el valor que guardó Excel, y en el CSV todo es texto.
  - **Inyección CSV.** Los nombres y emails con prefijo de fórmula se rechazan, así que nunca se guardan. Los CSV que genera la pantalla neutralizan esos prefijos con un apóstrofo.
- **Entrada de las rutas**, en este orden y antes de leer un solo byte del cuerpo:
  1. sesión y mismo origen;
  2. academia en la query (`?organizationId=`) y permisos;
  3. límite de peticiones;
  4. `Idempotency-Key`, en la confirmación;
  5. tamaño declarado.

  Después el cuerpo se lee en streaming y se corta al superar el límite, aunque no haya `Content-Length`.
- **Límite de peticiones:** 10 por minuto, contadas **por ruta** (vista previa y confirmación por separado), **por academia y por dirección del cliente**.
- **Idempotencia:**
  - La confirmación exige `Idempotency-Key`.
  - Con la misma clave devuelve el resultado guardado en `outbox_events` (`athlete.import_confirmed`) sin volver a crear nada. Con la misma clave y otro fichero responde `IDEMPOTENCY_CONFLICT`.
  - La pantalla reutiliza la clave si se pierde la respuesta.
  - La confirmación exige además el token de la vista previa: un hash del fichero, del mapeo, **de la academia y del usuario**. Si no coincide, responde `IMPORT_PREVIEW_STALE`.
- **Concurrencia.**
  - El fichero se procesa y clasifica una sola vez, **fuera** del bloqueo de la organización.
  - Bajo el bloqueo (el mismo que toma cualquier alta de gimnasta) se bloquea el cupo de los grupos afectados en orden. Después se vuelve a decidir cada fila contra el estado actual y se escribe.
  - Dos confirmaciones simultáneas del mismo fichero crean cada gimnasta una sola vez.
- **Datos personales fuera de los registros.**
  - El evento y la auditoría solo guardan identificadores, filas y códigos.
  - Los errores de base de datos salen del servicio sin sus parámetros, solo con el SQLSTATE, para que ni los logs ni Sentry reciban nombres o contactos.

## Diseño

- `src/modules/athlete-import/domain/athlete-import-rows.ts` contiene las funciones puras: columnas, mapeo, validación de filas, claves de duplicado, plantilla CSV y CSV seguros.
  - La normalización de contactos es la del editor, extraída a `src/modules/families/domain/guardian-contact-normalization.ts`, que `owner-guardian-contacts.ts` reexporta sin cambios.
- `src/modules/athlete-import/application/athlete-import-file.ts` lee los CSV y XLSX con `csv-parse` y `xlsx` (SheetJS 0.20.3). Ambas ya eran dependencias del proyecto: **no hay dependencias nuevas**.
- `src/modules/athlete-import/application/athlete-import-service.ts` es la fachada: vista previa, confirmación y token.
- Sus módulos internos en `athlete-import/`, protegidos por la frontera ESLint de `eslint.internal-boundaries.json`:
  - `context` (autorización y estado de la academia);
  - `classify` (decisión pura por fila, compartida por la vista previa y la confirmación);
  - `write` (inserciones en bloque con `jsonb_to_recordset`, evento y auditoría);
  - `preview` y `model`.
- **Rutas:** `POST /api/v1/owner/athlete-import/preview` y `/confirm`, con su entrada común en `import-request.ts`.
- **Plantilla Excel:** `src/components/owner-dashboard/athlete-import-template.ts` carga `xlsx` en el navegador solo al pulsar el botón.
- **Sin migración.** Usa las tablas canónicas existentes. El resultado de cada importación vive en su evento de outbox, que también sirve de recibo de idempotencia.

## Pruebas

- `tests/athlete-import-rows.test.ts`: mapeo, fechas, fecha opcional, emails y teléfonos con la regla del editor, parentesco, prefijos de fórmula, nombres en otros alfabetos, plantilla y CSV seguro.
- `tests/athlete-import-file.test.ts`:
  - **CSV:** filas lógicas (celdas de varias líneas, filas vacías), límite exacto con más de 2.000 líneas físicas, exceso tras el antiguo corte, Windows-1252.
  - **XLSX:** más de 1.000 filas, 1.000 filas con huecos, filas ocultas, sistema de fechas 1904, fórmulas con valor guardado.
  - **Bomba ZIP:** un ZIP sintético de unos pocos KB que declara más de 20 MB.
  - **Ficheros malformados.**
- `tests/athlete-import-classify.test.ts` (excepción revisada de la frontera): duplicados con y sin fecha, grupos, capacidad, hermanas, tutores existentes (contacto compartido, contactos de dos tutores, otro nombre, varias familias), tutores distintos con el mismo email en el fichero y límite del plan.
- `tests/athlete-import-routes.test.ts`: 401, origen, 403 por rol y por sede, 429, 413 por tamaño declarado y por streaming, falta de `Idempotency-Key` y de la declaración. En todos los rechazos se comprueba que no se leyó el cuerpo.
- `tests/athlete-import-pg.test.ts` (PostgreSQL desechable):
  - **Escritura:** lo que se escribe, incluida la fecha local; el evento sin datos personales; la misma clave no duplica; clave reutilizada, vista previa ajena y token de otra academia.
  - **Aislamiento** entre academias.
  - **Límites:** Free, solo lectura y capacidad del grupo.
  - **Permisos:** coordinación, entrenador, propiedad y administración con sedes limitadas.
  - **Tutores:** existente con el mismo nombre, con otro nombre y contacto compartido.
  - **Concurrencia:** dos confirmaciones simultáneas.
  - **Bloqueos:** una prueba falla si se quita la segunda evaluación bajo el bloqueo; otra, si se quita el bloqueo de grupos.
- `tests/owner-athlete-import-workspace.test.tsx` (pantalla):
  - resumen, filas y glosario;
  - la declaración obligatoria;
  - un mapeo cambiado obliga a actualizar;
  - la misma clave tras un fallo de red;
  - solo lectura, filas ocultas y columnas que faltan.

## Decide Elvis

1. **Quién importa.** Hoy solo la propiedad o la administración con todas las sedes, como el alta manual. ¿Se amplía a la coordinación, o a sedes limitadas importando solo a sus grupos?
2. **Fecha de nacimiento.** Es opcional, como en el alta manual; sin ella los duplicados se comparan solo por nombre y hay más falsos duplicados. ¿Se hace obligatoria en la importación?
3. **Pagador.** Como en el alta manual, el tutor importado no queda como pagador y la familia queda «incompleta». ¿Debe ser pagador principal?
4. **Teléfono.** Se aplica la regla exacta del editor: E.164 sin espacios. «+34 600 000 000» y «600000000» dan error. ¿Se aceptan espacios o se asume +34 en la importación y en el editor?
5. **Gimnasta existente con el mismo nombre y sin fecha.** Hoy la fila no se importa. ¿Se prefiere importarla con aviso?
6. **Tutor existente con varias familias.** Hoy da error. ¿Se ofrece elegir la familia en la vista previa?
7. **Texto de la declaración.** «Declaro que tengo base legal para tratar estos datos y que he informado a las familias». ¿Lo revisa la persona de protección de datos?
8. **Límite de 1.000 filas.** Se mantiene, con el aviso de exceso.
9. **Inscripciones en clases y tarifas.** Quedan para una fase 2.
