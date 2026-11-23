# ADR-0030 — Vocabulario de sala por país en la biblioteca de elementos

- Estado: **aceptado** el 21-11-2026 por Elvis (opción A con la búsqueda).
  No autoriza encender ninguna bandera en staging ni en producción: cada
  entorno necesita su permiso.
- Alcance: `src/modules/element-library/` (ficha y búsqueda). No toca la base
  de datos.
- Relacionados: ADR-0029 (biblioteca de elementos); investigación de
  vocabulario en la documentación interna,
  `documentacion/Zaltyko/biblioteca/vocabulario/` (`mexico-fuentes.json`,
  `espana-fuentes.json`, `glosario-espana-aplicado.md`), fuera de este
  repositorio.

## Contexto

- **Los textos del catálogo hablan como en España.** El 21-11-2026 Elvis
  decidió que nombres, nombres cortos y descripciones usen el vocabulario de la
  RFEG («kippe», «molino», «vuelta de plantas», «rondada», «paloma»,
  «pirueta»), con una capa por país para el resto.
- **México dice otra cosa en casi la mitad de los términos.** De 72 términos
  investigados con fuente, 47 son distintos en México, 20 iguales y 5 sin
  fuente. Algunos se cruzan: en España «molino» es la gran vuelta (atrás o
  adelante); en México «gigante» es la de atrás y «molino» la de adelante. En
  México «árabe» a secas es la rueda sin manos, y el mortal árabe se llama
  «mortal japonesa».
- **Los términos aparecen mucho.** En los 564 elementos de las tandas 1–11:
  «pirueta» en 152, «rondada» en 62, «flik-flak» en 60, «paloma» en 57,
  «molino» en 9, «kippe» en 10.
- **El país de la academia ya se sabe.** `zaltyko.organizations.country_code`
  es obligatorio (`^[A-Z]{2}$`, «ES» por defecto), y `organization_sports`
  lo repite con una FK. No hace falta columna nueva.
- **Los textos están revisados por Elvis** (ADR-0029 §1.7). Lo que se enseñe
  a una academia debe ser texto revisado, no generado al vuelo.

## Opciones

### A. Glosario por país junto a la ficha

La ficha añade un recuadro «Así se dice en México» con las palabras de esa
ficha que cambian: «rondada → redondilla», «paloma → resorte», «pirueta →
giro». El texto del catálogo no cambia.

- A favor: el texto revisado se queda como está; cada par lo revisa una
  persona una vez y sirve para cientos de fichas; no hay errores de gramática;
  enseña las dos formas de decirlo, que ayuda a quien compite con jueces
  formados con el Código en español de otro país.
- En contra: la entrenadora lee primero la palabra de España.

### B. Sustitución al mostrar

Se cambian las palabras en el texto al pintarlo: «una kippe» → «un kip».

- En contra, y por eso se descarta:
  - **Gramática.** «la kippe» → «el kip», «una paloma» → «un resorte»: hay que
    cambiar artículos y adjetivos, y una regla no lo hace bien siempre.
  - **Cruces.** «molino adelante» se queda «molino» en México y «molino atrás»
    pasa a «gigante»; «rueda sin manos» pasa a «árabe» y «mortal árabe» a
    «mortal japonesa». Un orden de reglas mal puesto da el elemento contrario.
  - **Texto sin revisar.** La academia vería frases que nadie ha leído, con la
    etiqueta de revisadas.
  - Rompe la regla de no reescribir los textos por país.

### C. Nombre corto alternativo por país

Cada elemento puede tener, por país, su propio nombre y nombre corto
(«Gigante atrás con media pirueta»), escritos y revisados uno a uno. La
descripción sigue en vocabulario de España.

- A favor: el título de la ficha y del buscador sale en palabras de su sala.
- En contra: son unos 560 nombres más que revisar por país, y alguien de
  México tendría que leerlos. No arregla la descripción.

## Decisión

**A ahora, con la búsqueda por palabras del país. C solo si, con la
biblioteca en uso, las academias mexicanas lo piden.**

1. **Archivo por país**, revisado y en el código:
   `src/modules/element-library/data/vocabulario/<país>.json` (`mx.json`
   primero), con esquema zod estricto. Cada entrada:
   - `es`: las formas en que aparece en los textos del catálogo («molino
     atrás»), de 2 a 60 caracteres;
   - `local`: cómo se dice en ese país («gigante»), de 1 a 80;
   - `note`: aclaración opcional de hasta 140 («al frente se dice
     molino»);
   - `confidence` (`alta`, `media`) y `source`, una etiqueta corta del
     documento («FMG, Código Xcel GAF en español»), sin citas ni enlaces;
   - `reviewStatus` (`draft`, `reviewed`). Solo las revisadas se muestran.

   Los términos «sin fuente» y los que son iguales en los dos países no
   entran.
2. **Coincidencias.** Sin mayúsculas ni acentos y por palabra completa, la
   forma más larga primero y sin solaparse: «paloma sin manos» gana a
   «paloma». Se buscan en nombre, nombre corto y descripción de la ficha. Si
   una forma coincide con lo mismo en los dos países, no se muestra.
3. **Ficha.** Si la academia es de un país con archivo, la ficha muestra el
   recuadro «Así se dice en México» con los pares de esa ficha, en el orden en
   que aparecen. Sin pares, no hay recuadro. España y los países sin archivo
   ven la ficha como hoy.
4. **Búsqueda.** Una entrenadora mexicana que escribe «redondilla» o
   «gigante» encuentra los elementos con «rondada» o «molino». La búsqueda
   añade las formas de España que corresponden a las palabras del país; no
   quita resultados.
5. **País.** Se lee `organizations.country_code` de la academia ya autorizada
   en la misma transacción. Ningún otro país hereda el archivo de México: cada
   país necesita su archivo revisado.
6. **Bandera** `ZALTYKO_ELEMENT_LIBRARY_LOCAL_VOCABULARY_ENABLED`, apagada
   por defecto. Solo actúa con la biblioteca encendida.
7. **Sin datos nuevos en la base.** Sin migración ni candidata; el archivo no
   tiene datos personales, así que no hay clasificación nueva en data-rights.
8. **Fuentes y derechos.** Solo se guardan palabras sueltas y nombres de
   elementos, que son vocabulario de uso común, no texto del Código ni de los
   documentos de la FMG o de USA Gymnastics. Nada sale de Upgrade Gymnastics
   ni de GymPro Atlas. Las fuentes completas se quedan en la documentación
   interna.

## Consecuencias

- La entrenadora de México lee la ficha en vocabulario de España con sus
  palabras al lado, y busca con sus palabras.
- Añadir un país es un archivo, una revisión y nada más.
- Si un texto nuevo del catálogo usa una palabra de España que no está en el
  archivo, no sale par: falta un aviso, no un error. Un test lista las
  palabras del glosario de España que aparecen en el catálogo y no tienen
  entrada en `mx.json`, para revisarlas al cerrar cada tanda.

## Validación requerida

- Esquema estricto del archivo; sin entradas repetidas ni formas vacías.
- Coincidencias: más larga primero («paloma sin manos», «mortal árabe»),
  palabra completa (los plurales van como forma propia en `es`), sin acentos
  y sin solapes.
- Ficha: España no ve el recuadro; México lo ve solo con entradas
  revisadas; bandera apagada, nada cambia.
- Búsqueda: «redondilla» encuentra «rondada»; los resultados de España no
  cambian.
- Revisión de `mx.json` por Elvis (o por una entrenadora mexicana) antes de
  pedir permiso para encender la bandera en staging.

## Decisiones de Elvis

Tomadas el 21-11-2026, al aprobar este ADR:

1. Opción A con la búsqueda. La C, solo si las academias mexicanas la piden.
2. Entran también los términos de confianza «media»; todos empiezan como
   borrador y solo se ven cuando están revisados.
3. Las palabras de México las revisa una entrenadora de una academia
   mexicana si la hay; si no, Elvis.
4. **23-11-2026 («revísalo todo tú»):** Elvis delega la revisión en Claude.
   Una sesión distinta comprobó cada entrada con material de la FMG y fuentes
   mexicanas (programas universitarios, traducciones de la FMG). Quedan
   revisadas las 47 entradas de confianza «alta»; las 18 de confianza «media»
   siguen en borrador hasta que las confirme una entrenadora mexicana. Una
   entrada puede limitarse a unos aparatos (`apparatus`), como «barra» →
   «viga», que solo vale en barra de equilibrio.

## Notas de la primera versión

- `mx.json` sale con todas las entradas en borrador: con la bandera encendida
  no se ve nada hasta que alguien las revise.
- «flik-flak» (RFEG) frente a «flic-flac» (México) es solo grafía y se
  pronuncia igual: no entra, para no llenar 60 fichas con un par que no
  ayuda.
- Los prefijos «salto leap» y «salto jump» de los documentos mexicanos son
  estilo de esos documentos, no palabras de sala: tampoco entran, salvo en
  los nombres de salto que cambian del todo («salto gato», «salto oveja»).
