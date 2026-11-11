# Importar gimnastas desde Excel o CSV (O4)

Fecha: 11 de noviembre de 2026. Matriz competitiva (`docs/research/competencia/matriz-competitiva.md`), O4: «Importación de Excel con vista previa + migración asistida». RG Manager, OneClub, Clybo y FlipBiz anuncian importación; en el flujo canónico de `/owner` no había ninguna. Este documento cubre el importador mínimo. La migración asistida, es decir la llamada de 30 minutos, es proceso y no código.

Objetivo: que una academia que vive en Excel pase sus gimnastas, sus tutores y sus grupos a Zaltyko sin teclearlos uno a uno, viendo antes de guardar qué se va a crear, qué no y por qué.

## Recorrido

1. **Gimnastas → «Importar desde Excel o CSV»** (`/owner/athletes/import`).
2. **Plantilla.** El botón «Descargar plantilla» baja un CSV con los títulos en español, separados por `;` y con BOM UTF-8 para que Excel los abra con tildes. No trae fila de ejemplo, para que nunca se importe por error.
3. **Fichero.** Se sube un CSV o un `.xlsx`. Del Excel se lee la primera hoja.
4. **Vista previa.** No escribe nada y tiene tres partes:
   - **Columnas.** Se asignan solas por el título, sin distinguir mayúsculas ni tildes y con sinónimos frecuentes («F. nacimiento», «Móvil», «Correo»…). Cada asignación se puede cambiar con un desplegable. Si falta una columna obligatoria o se repite una, se explica y no se muestran filas.
   - **Resumen.** Indica cuántas gimnastas, familias, tutores y altas en grupo se crearán, y cuántas filas tienen errores, están duplicadas o no se importan. Muestra también el límite del plan.
   - **Filas.** Una tabla con el resultado de cada fila («Se crea», «Error», «Duplicada» o «No se importa») y sus errores y avisos en español. «Descargar filas a revisar» baja un CSV con las filas que no se crean y su motivo.
5. **Importar N gimnastas.** Crea todas las filas válidas en una sola transacción y muestra cuántas se crearon y qué filas se saltaron, con su motivo.

## Columnas

| Columna | Obligatoria | Regla |
|---|---|---|
| Nombre, Apellidos | Sí | Hasta 100 caracteres. No pueden empezar por `=`, `+`, `-` ni `@`. |
| Fecha de nacimiento | Sí | `DD/MM/AAAA` (también con `-` o `.`) o `AAAA-MM-DD`; en Excel vale una celda de fecha. El año va con cuatro cifras, porque 05/03/12 es ambiguo. No puede ser futura ni anterior a 1900. |
| Grupo | No | Nombre de un grupo activo de una sede activa, sin distinguir mayúsculas ni tildes. Si no existe o hay dos con ese nombre, la fila da error. |
| Nombre y apellidos del tutor | Si hay tutor | Si solo hay «Nombre del tutor» con varias palabras, la primera se toma como nombre y el resto como apellidos, con aviso. |
| Email del tutor | No | Se valida y se guarda en minúsculas, como en el editor de contactos. |
| Teléfono del tutor | No | Formato E.164: `+34 600 000 000`; un `0034` inicial se convierte en `+34`. **No se adivina el prefijo**, igual que en el editor de contactos. |
| Parentesco | No | Madre o padre, tutor legal, acogida u otro. Si está vacío se registra madre o padre; si no se reconoce, «otro». Ambos casos dan aviso. |

## Qué se crea por cada fila válida

- **La gimnasta:** su ficha (nombre, apellidos y fecha de nacimiento) y su registro de gimnasta.
- **Su familia** y el vínculo gimnasta–familia desde hoy.
  - Las hermanas con el mismo email o el mismo teléfono de tutor comparten una familia nueva.
  - Si el email o el teléfono ya son de un tutor de la academia con **una** familia activa, la gimnasta se añade a esa familia y no se crea otro tutor.
  - Si ese tutor tiene varias familias o ninguna, la fila da error y hay que darla de alta a mano. Lo mismo ocurre si el email y el teléfono son de dos tutores distintos.
- **El tutor**, si la fila lo trae: su persona, el registro de tutor, el vínculo con la familia y sus contactos principales. Cuando las filas de las hermanas aportan contactos distintos, se toman el primer email y el primer teléfono.
- **El alta en el grupo**, si la fila lo trae: queda activa desde hoy según la fecha local de la sede, con su historial. Si el grupo se llena, la fila siguiente no se importa.
- **Sin grupo**, la gimnasta queda en la bandeja de Gimnastas sin asignar, igual que con el alta manual.

No se crea pagador ni inscripción en clases. La familia queda «incompleta» hasta elegir un pagador desde el flujo de siempre.

## Criterio de duplicados

Es conservador: ante la duda, la fila no se importa. Se compara siempre dentro de la academia.

1. **Misma gimnasta:** mismo nombre y apellidos, comparados sin mayúsculas, tildes ni signos, y misma fecha de nacimiento. Cuenta también una gimnasta archivada; en ese caso el aviso pide reactivarla desde su ficha.
2. **Posible duplicado:** si en la academia hay una gimnasta con el mismo nombre y **sin** fecha de nacimiento (el alta manual no la pide), la fila no se importa y se pide revisarla. Así no se duplican las gimnastas creadas a mano antes de importar.
3. **Dentro del fichero:** la segunda aparición de la misma gimnasta se marca como duplicada de la primera.

Dos hermanas con el mismo nombre y la misma fecha (gemelas homónimas) no se distinguen. Hay que crear la segunda a mano.

## Límites y seguridad

- **Plan.** El resumen muestra el uso y el límite (por ejemplo, Free: 30 gimnastas). Se crean filas en el orden del fichero hasta el límite y las demás salen como «No se importa». La confirmación vuelve a calcularlo con el bloqueo de la organización, así que una alta hecha entre la vista previa y la confirmación cuenta.
- **Solo lectura.** Si la academia supera su plan, la vista previa lo avisa y la confirmación responde `PLAN_OVER_CAPACITY` sin escribir nada.
- **Quién puede importar.** Dirección (`owner`), administración (`admin`) y coordinación (`manager`).
  - La coordinación limitada a algunas sedes solo ve los grupos de sus sedes, y cada fila debe ir a uno de ellos.
  - El entrenador recibe 403 en la ruta y en el servicio.
  - Todo se vuelve a comprobar en el servidor, dentro de la transacción.
- **Fichero:**
  - **Tamaño:** máximo 2 MB, 1.000 filas y 50 columnas.
  - **Dónde se lee:** en memoria en el servidor, sin guardar nada en disco ni en almacenamiento.
  - **Tipo:** se decide por el contenido, no por el nombre. Un ZIP es XLSX y lo demás es CSV en UTF-8 o Windows-1252, con `;`, `,` o tabulador. Los `.xls` antiguos se rechazan.
- **Fórmulas:**
  - **No se evalúan nunca.** Del XLSX se lee el valor que guardó Excel, y en el CSV todo es texto.
  - **Inyección CSV.** Los nombres que empiezan por `=`, `+`, `-` o `@` se rechazan, así que nunca se guardan. Los CSV que genera la pantalla neutralizan esos prefijos con un apóstrofo.
- **Idempotencia:**
  - La confirmación exige `Idempotency-Key`.
  - Con la misma clave devuelve el mismo resultado, guardado en `outbox_events` (`athlete.import_confirmed`), sin volver a crear nada.
  - Con la misma clave y otro fichero responde `IDEMPOTENCY_CONFLICT`.
  - La pantalla reutiliza la clave si se pierde la respuesta.
  - La confirmación exige además el token de la vista previa: un hash del fichero y del mapeo. Si no coincide, responde `IMPORT_PREVIEW_STALE`.
- **Límite de peticiones:** 10 por minuto y academia en `/api/v1/owner/athlete-import`.
- **Eventos y auditoría:** el evento y la auditoría solo guardan identificadores, filas y códigos, nunca nombres ni contactos.

## Diseño

- `src/modules/athlete-import/domain/athlete-import-rows.ts` contiene las funciones puras: columnas, mapeo, validación de filas, clave de duplicado, plantilla y CSV seguros.
- `src/modules/athlete-import/application/athlete-import-file.ts` lee los CSV y XLSX con `csv-parse` y `xlsx` (SheetJS 0.20.3), que ya eran dependencias del proyecto. **No hay dependencias nuevas.**
- `src/modules/athlete-import/application/athlete-import-service.ts` hace la vista previa (solo lectura) y la confirmación:
  - la confirmación toma el bloqueo de comando y el de la organización, comprueba la escritura y bloquea el cupo de los grupos afectados;
  - después vuelve a decidir cada fila con datos frescos;
  - las inserciones van en bloque con `jsonb_to_recordset`, en una transacción.
- Rutas:
  - `POST /api/v1/owner/athlete-import/preview`;
  - `POST /api/v1/owner/athlete-import/confirm`.

  Su entrada común está en `import-request.ts`: sesión, mismo origen, tamaño, formulario, ámbito Owner y límite de peticiones.
- **Sin migración.** Usa las tablas canónicas existentes y no hay tabla de lotes: el resultado de cada importación vive en su evento de outbox, que también sirve de recibo de idempotencia.
- **Sin frontera ESLint.** No hay módulos internos que proteger.

## Pruebas

- `tests/athlete-import-rows.test.ts`: mapeo, fechas, emails, teléfonos, parentescos, validación de filas, plantilla y CSV seguro.
- `tests/athlete-import-file.test.ts`:
  - CSV con BOM, punto y coma, coma y Windows-1252;
  - XLSX con fechas, números largos, fórmulas y números de fila;
  - ficheros malformados: vacío, sin filas, comillas sin cerrar, `.xls`, binario, ZIP roto, demasiado grande, demasiadas filas o columnas.
- `tests/athlete-import-classify.test.ts`: duplicados, grupos y sedes, capacidad, hermanas y tutores existentes, límite del plan.
- `tests/athlete-import-pg.test.ts` (PostgreSQL desechable):
  - lo que se escribe;
  - la misma clave no duplica;
  - el mismo fichero con otra clave solo da duplicados;
  - clave reutilizada y vista previa que no coincide;
  - aislamiento entre academias;
  - límite Free;
  - solo lectura;
  - el entrenador no puede importar;
  - coordinación con una sede;
  - capacidad del grupo.
- `tests/owner-athlete-import-workspace.test.tsx` (pantalla):
  - resumen y filas;
  - el mapeo cambiado obliga a actualizar;
  - la misma clave tras un fallo de red;
  - solo lectura;
  - columnas que faltan.

## Decide Elvis

1. **Fecha de nacimiento obligatoria.** Sin ella no hay criterio fiable de duplicados. ¿Se admite importar sin fecha (solo por nombre, con más falsos duplicados)?
2. **Pagador.** Hoy el tutor importado no se registra como pagador y la familia queda «incompleta». ¿Debe ser pagador principal desde hoy?
3. **Teléfono sin prefijo.** Hoy se rechaza («600 000 000»). ¿Se asume +34 cuando la academia es española, aunque el editor de contactos no lo hace?
4. **Gimnasta con el mismo nombre y sin fecha en la academia.** Hoy la fila no se importa. ¿Se prefiere importarla con un aviso?
5. **Tutor existente con varias familias.** Hoy da error. ¿Se ofrece elegir la familia en la vista previa?
6. **Inscripciones en clases y tarifas.** Quedan fuera del importador mínimo. ¿Entran en una segunda fase?
7. **Límite de 1.000 filas por fichero.** ¿Se ajusta a 500 o a 2.000?
