# Integración del MVP y procedencia — 25 de octubre de 2026

## Hallazgos

- El checkout recuperado está en `d5b8d961c91ce4b7c9cfa59965f81de37766857d`.
  Git confirma que `f626351` es ancestro de ese commit. El trabajo posterior
  incluye las pruebas y correcciones de alta, asistencia y facturación manual.
- El commit de importación `f0bc9383d300da6cde76c91f0752ef63afb61d19` de la
  rama MVP conserva los 1.939 archivos de `src/` de ese origen con los mismos
  blobs Git: ninguno falta y ninguno cambia. Conserva además cinco archivos
  de main: la ruta de lista de espera de eventos y cuatro README de módulos.
  La rama está basada en main `f84fd6dc`; es una importación de árbol, no una
  continuación de la línea de commits recuperada. Ambas historias permanecen.
- La integración incorpora la rama de PR #236 hasta
  `16e1eaa2684e5e045e2c70141cc910ac7efbd1fa`. Se resolvieron 13 conflictos;
  los cambios de producto incorporados son la adaptación de validadores UUID
  de Zod 4 a la aceptación UUID-like previa. La comparación estática de líneas
  conserva las guardas transaccionales y las reglas del MVP.
- Se mantiene el guard de red sintético del MVP: solo el script Replay exacto
  de Sentry queda clasificado como telemetría esperada; todo tráfico externo
  continúa bloqueado. Se mantiene la validación de entorno del MVP.
- Las declaraciones de Sentry diferían entre ramas, pero ambos lockfiles ya
  resolvían `10.76.2`. Se conservan esa versión, Vite `6.4.5`, Hono `4.13.13`
  y las correcciones de selector-parser existentes en el MVP.
- Se elimina la copia transitiva Zod `3.25.76` del protocolo de navegador y se
  enlaza con el nodo parcheado `4.6.7` ya presente. El hook aplica Zod parcheado
  a consumidores transitivos y conserva las líneas 1 y 2 de body-parser en
  dependencias normales, opcionales y de desarrollo, sin convertir una línea
  futura o un protocolo workspace a una API distinta. El checksum del hook se
  calcula con el mismo MD5/Base32 que coincide con ambos lockfiles originales.
- El runner E2E de GitHub Actions conserva el límite remoto autorizado de
  seis minutos; el límite fuera de Actions permanece en cuatro minutos.
- No se modifican archivos SQL ni se ejecutan instalaciones, builds, pruebas
  o servicios locales. La integración necesita su propia CI remota; las CI
  verdes de los padres no la acreditan.

## Fuente

Objetos Git locales del repositorio, comparación `git ls-tree -r` de `src/`,
`git merge-base --is-ancestor`, resolución revisada del merge de PR #236 y
comparación del lockfile con ambos padres. La advisory de Zod es
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Importancia

Aclara el origen del código sin reescribir historia y reúne las correcciones
de dependencias con la operativa del MVP en un candidato revisable. El estado
de CI del padre `16372217` deja de ser prueba del candidato integrado.

## Siguiente paso

Ejecutar los controles remotos del commit integrado y obtener revisión
independiente. Después validar el candidato en una preview de entrega separada,
con autenticación y persistencia sandbox, antes de promover aplicación alguna.
Las fixtures del ensayo y la preview del ensayo permanecen protegidas.


## Revision independiente posterior: compatibilidad pendiente

QA encontro que chromium-bidi 17.0.2 publicado declara zod ^3.24.1. Se contrasto el manifiesto del registro npm y el tarball publicado: parseObject accede a parseResult.error.errors, propiedad incompatible con Zod 4. El main upstream ya declara Zod 4 pero no prueba que el tarball 17.0.2 lo soporte. La CI del SHA 8ff33d7e no acredita esta ruta. Se prepara una comprobacion del parser real con entrada valida e invalida; no se ha ejecutado localmente ni debe considerarse PASS. No se publica hasta resolver y verificar la compatibilidad remotamente.

Correccion de alcance: readiness y E2E autenticado estan desactivados mediante if:false; su skip no acredita falta de credenciales. No se reactivan los pasos que aplican migraciones o preparan fixtures protegidas.


### Correccion preparada del parser publicado

Parche pnpm acotado a chromium-bidi 17.0.2: parseResult.error.errors pasa a parseResult.error.issues. Se conserva el protocolo publicado y Zod 4.6.7; no se degrada a una version vulnerable. Los tres z.record del generador publicado ya usan dos argumentos. El parche y su hash MD5/Base32 quedan declarados en manifest y lockfile, siguiendo el mecanismo existente de braces. La comprobacion remota del parser importa el paquete realmente instalado, acepta userContext string y exige que un numero se rechace sin TypeError. Pendiente de instalacion congelada y prueba remota; ninguna ejecucion local.
