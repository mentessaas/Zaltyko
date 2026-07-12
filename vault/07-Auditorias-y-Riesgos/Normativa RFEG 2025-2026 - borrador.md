---
status: active
owner: producto/tech
last_reviewed: 2026-07-12
---

# Normativa RFEG 2025/2026 — CONFIRMADO (GAF Base/Vía Olímpica, GAM Base, GR categorías individuales); resto pendiente

> Estado de persistencia (2026-07-12): el catalogo confirmado fue versionado como
> `rfeg-2026-v2` y sincronizado en Supabase. El comando acotado desactivo codigos anteriores
> sin borrarlos, creo los fallbacks genericos y verifico que la seleccion federativa de la
> academia existente seguia siendo valida. No se ejecuto el seed global ni una migracion de
> schema.

## Actualización 2026-07-12 (tarde) — el usuario proporcionó los PDFs oficiales

El usuario descargó desde su propio navegador (el CAPTCHA descrito abajo no le afectó a él, solo bloqueaba el acceso automatizado) y compartió directamente:
- `PROGRAMA-TECNICO_GAF_2026.pdf` (19 páginas, aprobado JD 26 septiembre 2025)
- `PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf` (19 páginas, aprobado JD 26 septiembre 2025)
- `NORMATIVA-TECNICA-GR-2026.pdf` (12 páginas, aprobado JD 26 septiembre 2025)

Se leyeron completos (herramienta de lectura de PDF, requirió instalar `poppler` vía `brew install poppler` para renderizar las páginas). **Ya no son fuentes secundarias — son lectura directa del documento oficial.** Los datos confirmados abajo YA se aplicaron a `src/lib/sport-config/catalog.ts` (ver `Changelog interno.md` 2026-07-12).

### GAF (Gimnasia Artística Femenina) — CONFIRMADO, doblemente (2 documentos oficiales independientes coinciden)
- **Programa Base: 10 niveles** (Base 1 a Base 10), de dificultad ascendente, independiente de la edad — resuelve la contradicción anterior (2 vs 10 vs 3 niveles): **la respuesta correcta es 10.**
- **Vía Olímpica: 10 niveles ligados a la edad**, confirmados con nombre y edad exactos: VO1 Pre-Benjamín (≤8), VO2 Benjamín (≤9), VO3 Pre-Alevín (≤10), VO4 Alevín (≤11), VO5 Infantil (≤12), VO6 Pre-Juvenil (≤13), VO7 Juvenil (13-14), VO8 Sénior (15+), VO9 Júnior (14-15), VO10 Sénior Élite (16+). El orden Sénior(VO8) antes de Júnior(VO9) es tal cual aparece en el documento oficial — no es un error, no corregirlo.
- **Cross-check 2026-07-12 (tarde)**: `NORMATIVA-TECNICA_GAF_2026.pdf` (documento distinto de `PROGRAMA-TECNICO_GAF_2026.pdf`, carpeta `documentos normativos por pais/España/`) repite la misma tabla de Vía Olímpica idéntica — confirmación cruzada entre 2 documentos oficiales independientes, máxima confianza. Ese mismo documento añade en su Anexo 2 las edades "recomendadas" (no obligatorias) para el Programa Base: 6 años→B1, 7→B2 ... 15+→B10 — no se cargó en el catálogo como edad porque el programa Base es explícitamente independiente de la edad ("cada gimnasta participa en el nivel en que se sienta segura"), solo se documenta aquí como referencia.

### GAM (Gimnasia Artística Masculina) — CONFIRMADO (actualización 2026-07-12, tarde)
- **Programa Base: 5 niveles** (Base 1 a Base 5), con edades: Base 1 hasta 9 años (no <7), Base 2 hasta 11, Base 3 hasta 13, Base 4 hasta 15, Base 5 hasta 17. Confirma que GAM y GAF NO comparten estructura de niveles (nunca asumir que son iguales).
- **Vía Olímpica GAM: CONFIRMADO.** El usuario proporcionó `NORMATIVA-TECNICA-GENERAL_GAM_2026.pdf` (carpeta `documentos normativos por pais/España/`), que sí incluye la tabla "Campeonato de España 2026" por edad: Benjamín (7-9 años, 2019-2017), Alevín (≤11, 2019-2015), Infantil (≤13, 2019-2013), Cadete (≤15, 2019-2011), Juvenil (≤17, 2019-2009), Sénior (16+, 2010-), Júnior (15-18, 2011-2008), Sénior Élite (18+, 2008-). 8 categorías, estructura distinta a las 10 de GAF (GAM tiene "Cadete", que GAF no tiene; GAF tiene variantes "Pre-", que GAM no tiene). Ya aplicado a `catalog.ts` (`GAM_AGE_CATEGORIES`/`GAM_ARTISTIC_LEVELS`).
- El mismo documento confirma el Programa Nacional Base con años de nacimiento exactos (coincide con los datos ya cargados desde `PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf`), y confirma los 6 aparatos (suelo, arcos/potro, anillas, salto, paralelas, barra) ya presentes en el catálogo.

### GR (Gimnasia Rítmica) — Categorías individuales CONFIRMADAS, Base NO confirmado
Categorías del Campeonato de España Individual y Autonomías 2026 (nombre, año de nacimiento, aparatos exactos de esa categoría):
- Benjamín (2017-2018): Manos Libres y Cuerda
- Alevín (2015-2016): Manos Libres, Aro y Pelota
- Infantil (2013-2014): Cuerda, Pelota y Cinta
- Júnior (2011-2012): Aro, Pelota y Mazas
- Sénior (2010 y anteriores): Aro, Pelota y Cinta
- 1ª Categoría (2011 y anteriores): Aro, Pelota, Mazas y Cinta (Programa FIG)
- Júnior Honor / Sénior Honor / Máster: variantes de alto rendimiento, ver documento.

**Hallazgo no trivial**: cada categoría de GR compite con un **subconjunto distinto de los 5 aparatos**, no con los 5 siempre. El schema actual (`apparatus` como lista plana por `sportLocaleConfigId`) no modela esto — es una simplificación conocida, documentada, no corregida en esta pasada (requeriría evaluar un cambio de schema, fuera de alcance de "actualizar catálogo").

El **programa/niveles de Base de GR** (equivalente a los "Base 1-10" de GAF) NO se confirmó — el documento leído es la normativa de competición individual, no cubre el nivel Base. Hay un PDF específico "Listado ascensos Nivel Base" (enlace abajo) sin leer todavía.

## Hallazgo arquitectónico nuevo (no estaba en el plan original): existe un TERCER sistema paralelo

Al buscar referencias a los códigos viejos (`nivel_a`, `pre_iniciacion`, etc.) para verificar que no quedaran huérfanos tras el update de `catalog.ts`, aparece **otro sistema completo e independiente**, activo en producción:

- `src/db/schema/templates/` (tablas `templates`, `templateAgeCategories`, `templateApparatus`, `templateCompetitionLevels`, etc.)
- `src/db/seeds/templates/espana-ga.ts` / `espana-gr.ts` — seeds propios para España, con su propio conjunto de categorías de edad (`pre_iniciacion, iniciacion, alevin, infantil, junior, senior, absoluta`), **comentado explícitamente en el código como "según normativa RFEG 2022-2024"** (más desactualizado incluso que lo que tenía `sport-config/catalog.ts` antes de hoy) y con el comentario "Mismos categorías por edad que GR" — que ahora sabemos, por los PDFs oficiales, que es **falso**: GAF, GAM y GR tienen categorías de edad distintas entre sí.
- Se siembra vía `scripts/seed.ts` (`pnpm db:seed`, manual — no automático como `seedSportConfigurations()`).
- **Está en uso real**: `src/lib/athletes/age-category.ts` lee de `templateAgeCategories` y lo consume `src/app/api/athletes/route.ts` (ruta API en vivo).
- `src/components/dashboard/GymMetricsWidget.tsx:97` tiene un cuarto lugar con el mismo array de códigos hardcodeado para ordenar categorías.

**Esto significa que la Fase 2 del plan ("conectar todo el producto") no es solo "conectar componentes sueltos al sistema `sport-config` existente" — hay al menos 3 fuentes de verdad compitiendo para el mismo concepto** (`sport-config`/`academySportConfigs`, `templates`/`templateAgeCategories`, y las constantes hardcodeadas de `athlete-edit.ts` + `GymMetricsWidget.tsx`). Decidir cuál es la fuente única de verdad real (probablemente `sport-config`, que es el más reciente y el que ya tiene el modelo país×disciplina×rama) y migrar/deprecar las otras dos es trabajo de arquitectura que debe planificarse explícitamente antes de la Fase 2, no descubrirse a mitad de una migración de componentes.

---

**No usar estos datos como fuente de verdad de producción (`src/lib/sport-config/catalog.ts`) hasta que una persona con conocimiento federativo real (entrenador/a licenciado, club, o la propia RFEG) confirme los puntos marcados como CONTRADICTORIO o NO CONFIRMADO abajo.** Este documento es el resultado de research web (búsquedas + intentos de fetch de PDFs oficiales) hecho en el marco del plan de nomenclatura federativa por país/disciplina (ver `Backlog priorizado.md` y `Changelog interno.md` 2026-07-12). **Nota: la sección de arriba con datos CONFIRMADOS ya reemplaza estas partes del borrador original; lo que sigue abajo documenta el proceso y lo que sigue sin confirmar (Base de GR, Vía Olímpica GAM).**

## Limitación metodológica importante

Se intentó descargar y leer directamente los PDFs oficiales de normativa técnica de la RFEG por varias vías (fetch de texto, descarga vía Node). **Causa raíz identificada 2026-07-12**: `rfegimnasia.es` tiene protección anti-bot activa — cualquier acceso automatizado a las URLs de PDF (`/wp-content/uploads/...`) es redirigido a un challenge `/.well-known/sgcaptcha/`. No se intentó ni se debe intentar sortear ese CAPTCHA. Toda la información de este documento hasta ahora viene de **fuentes secundarias** (blogs especializados, federaciones autonómicas, terceros que resumen la normativa), no de la lectura directa del PDF oficial. Esto explica por qué hay contradicciones entre fuentes — es un riesgo real, no un detalle menor.

**Enlaces oficiales confirmados 2026-07-12** (navegando `rfegimnasia.es/documentacion/` y las páginas por especialidad — estos SÍ son la fuente primaria correcta, solo falta que un humano los descargue y comparta el contenido, ya que el CAPTCHA bloquea la descarga automatizada):

**Gimnasia Artística Femenina** (`rfegimnasia.es/artistica-femenina/`):
- Normativa técnica: `https://rfegimnasia.es/wp-content/uploads/2026/02/NORMATIVA-TECNICA_GAF_2026.pdf`
- Programa técnico: `https://rfegimnasia.es/wp-content/uploads/2026/02/PROGRAMA-TECNICO_GAF_2026.pdf` ← el más relevante para resolver niveles Vía Olímpica/Base
- Aclaraciones normativa (preguntas y respuestas, mayo 2026): `https://rfegimnasia.es/wp-content/uploads/2026/05/GAF_PREGUNTAS-Y-RESPUESTAS-ACLARACIONES-NORMATIVAS_mayo2026.pdf`

**Gimnasia Artística Masculina** (`rfegimnasia.es/artistica-masculina/`):
- Normativa técnica: `https://rfegimnasia.es/wp-content/uploads/2026/02/NORMATIVA-TECNICA-GENERAL_GAM_2026.pdf`
- Programa técnico niveles: `https://rfegimnasia.es/wp-content/uploads/2026/02/PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf` ← el más relevante para niveles GAM
- Aclaraciones normativa (definitiva, mayo 2026): `https://rfegimnasia.es/wp-content/uploads/2026/05/GAM_Aclaraciones-Normativa-GAM-2026-definitiva.pdf`

**Gimnasia Rítmica** (`rfegimnasia.es/gimnasia-ritmica/`):
- Normativa técnica 2026: `https://rfegimnasia.es/wp-content/uploads/2026/03/NORMATIVA-TECNICA-GR-2026.pdf` ← el más relevante para categorías/niveles GR
- Exigencias técnicas: `https://rfegimnasia.es/wp-content/uploads/2026/02/EXIGENCIAS-TECNICAS_GR_2026.pdf`
- Aparatos 2025-2028: `https://rfegimnasia.es/wp-content/uploads/2026/02/APARATOS_GR_2025-2028.pdf`
- Listado ascensos Nivel Base: `https://rfegimnasia.es/wp-content/uploads/2026/03/GR-Nivel-Base-Ascensos-2025-2026.pdf`

**Común a las tres disciplinas**: Reglamento general de competiciones: `https://rfegimnasia.es/wp-content/uploads/2026/03/REGLAMENTO-GENERAL-DE-COMPETICIONES-RFEG.pdf`

**Riesgo de contaminación cruzada entre federaciones**: durante el research se detectó que dominios con acrónimos casi idénticos corresponden a federaciones distintas de países distintos — ej. `fmgimnasia.com` = Federación **Madrileña** de Gimnasia (España, regional) vs `fmgimnasia.org` = Federación **Mexicana** de Gimnasia. Cualquier research futuro sobre México debe verificar el dominio exacto antes de citar una fuente como "FMG".

## Gimnasia Artística Femenina (GAF) — Vía Olímpica

**CONFIRMADO por 2 fuentes independientes**: la Vía Olímpica tiene **10 niveles ligados a la edad** (no 3-4 como en el catálogo actual del código `ES:artistic_female` en `catalog.ts`).

| Nivel | Categoría (fuente 1) | Edad / año nacimiento (fuente 1) |
|---|---|---|
| 1 | Pre-Benjamín | hasta 8 años (2016-2018) |
| 2 | Benjamín | hasta 9 años (2015-2018) |
| 3 | Prealevín | hasta 10 años (2014-2018) |
| 4 | Alevín | hasta 11 años (2013-2018) |
| 5 | Infantil | hasta 12 años (2012-2018) |
| 6 | Prejuvenil | hasta 13 años (2011-2018) |
| 7 | Juvenil | 13-14 años (2011-2010) |
| 8 | Sénior | 15+ (2009 y anteriores) — **fuente 1 lo pone en la posición 8** |
| 9 | Júnior | 14-15 (2010-2009) — **fuente 1 lo pone en la posición 9, después de Sénior, lo cual es raro** |
| 10 | Élite | 16+ (2008 y anteriores) |

⚠️ **CONTRADICTORIO / SOSPECHOSO**: el orden Sénior (nivel 8) antes que Júnior (nivel 9) no tiene sentido cronológico normal (júnior suele preceder a sénior). Puede ser un error de la fuente secundaria o una particularidad real de la normativa (los niveles de Vía Olímpica no siempre corren en el mismo orden que las categorías de edad "abiertas"). **No usar este orden/nombres tal cual sin confirmación.**

Otra fuente (búsqueda directa) da una segunda versión, más simple, sin nombres de categoría, solo tope de edad: Nivel 1 hasta 8 años, Nivel 2 hasta 9, Nivel 3 hasta 10, Nivel 4 hasta 11, Nivel 5 hasta 12, Nivel 6 hasta 13, Nivel 7 hasta 13, Nivel 8 "14 años y más", Nivel 9 "14 y 15 años", Nivel 10 "16 años y más". Las dos fuentes coinciden en el número total (10) y aproximadamente en los cortes de edad de los primeros 6 niveles, pero difieren en el detalle de los niveles 7-10.

## Programa Base (GAF) — CONTRADICTORIO, no usar sin confirmación

Se encontraron **tres versiones incompatibles** en fuentes distintas:
1. "El programa Base incluye dos niveles iniciales: Base 1 hasta 8 años y Base 2 hasta 9 años" (una fuente).
2. "El programa base mantiene una estructura de **diez niveles** (B1-B10) con dificultad ascendente" (otra fuente).
3. Una tercera búsqueda menciona "Base 1, 2 y 3" en el contexto de requisitos de presencia del entrenador, sugiriendo al menos 3 niveles.

**No se puede resolver esta contradicción con research web adicional de fuentes secundarias — se necesita leer el PDF oficial directamente (un humano, o una herramienta de extracción de PDF que si funcione) antes de tocar el catálogo de Base en `catalog.ts`.**

## Gimnasia Artística Masculina (GAM)

Mucho menos explorado que GAF en este research. Un resultado de búsqueda indica que el "programa técnico de Base presenta **cinco niveles**" para GAM (distinto del femenino). Aparatos ya confirmados en el catálogo actual del código (`ES:artistic_male`): suelo, caballo con arcos, anillas, salto, paralelas, barra fija — estos 6 aparatos coinciden con el estándar FIG masculino y no se pusieron en duda en el research (alta confianza, es un estándar internacional estable, no específico de España).

## Gimnasia Rítmica (GR)

Aparatos: **confirmado, 5 aparatos FIG** — cuerda, aro, pelota, mazas, cinta (coincide con el catálogo actual del código).

Categorías de edad — **inconsistentes entre fuentes**, se encontraron al menos 3 listados distintos:
- Catálogo actual del código (`catalog.ts`, sin verificar contra fuente primaria): pre_iniciacion, iniciacion, alevin, infantil, junior, senior, absoluta.
- Fuente secundaria 1 (mezclada con resultados de México, dominio no verificado): pre-benjamín, benjamín, alevín, infantil, cadete.
- Fuente secundaria 2 (Indigo Sports, blog): Prebenjamín (6-7), Benjamín (8-9), Alevín (10-11), Infantil (12-13), Júnior (14-15), Sénior (16+), Primera Categoría (élite). Niveles de competición: Predeportiva/Escuelas, Iniciación/Promesas, Base, Copa Base y Copa de España, Absoluto, Primera Categoría.

Ninguna de estas tres listas es idéntica a otra. **Pendiente de confirmación con fuente primaria.**

## Tipos de competición (ambas disciplinas)

Confirmado con razonable confianza (aparece consistentemente en varias fuentes y ya está en el catálogo actual): Control técnico, Campeonato autonómico, Copa de España, Campeonato de España. La GR añade "Copa Base" y "Primera Categoría" según una fuente — no confirmado en GAF/GAM.

## Qué falta para cerrar esta fase con confianza

1. Un humano (o una herramienta de extracción de PDF distinta a la usada aquí) debe leer directamente al menos uno de estos tres PDFs oficiales y confirmar/corregir esta tabla:
   - `NORMATIVA-TECNICA-GR-2026.pdf` (rfegimnasia.es)
   - `NORMATIVA-TECNICA-GAF-2025.pdf` (referenciado por varias federaciones autonómicas que replican la normativa nacional)
   - `NORMATIVA-TECNICA-GAM-FAG.pdf` / `normativa_tecnica_gam_2026.pdf`
2. Resolver la contradicción de niveles de Base en GAF (2 vs 10 vs "al menos 3").
3. Confirmar el orden y nombres exactos de los niveles 7-10 de Vía Olímpica GAF.
4. Confirmar una única lista de categorías de edad de GR.

**Hasta que esto se resuelva, no se debe modificar `src/lib/sport-config/catalog.ts` con estos números — el riesgo de introducir datos incorrectos que un dueño de academia española vea como "oficiales" es mayor que el beneficio de dejar el catálogo actual (aunque desactualizado) sin tocar.**
