# Correcciones móviles de compression y source-map-js

## Compatibilidad con el proyecto Vitest combinado

Integración selectiva de Frontend `7627dc6c`: los subprocesos fijan cwd a mobile resuelto desde import.meta.url. Frontend reprodujo los dos MODULE_NOT_FOUND desde raíz antes del cambio; después 2/2 pasan desde raíz y desde mobile. Sin nuevas dependencias, exclusiones ni cambios de timeout. La comprobación Main en integración no pudo validar estas dos pruebas: este checkout no tiene mobile/node_modules; no se atribuye ese resultado al parche ni se presenta como PASS.

Parche local del 15 de octubre de 2026. npm lock: compression 1.8.1 → 1.8.2 y source-map-js 1.2.1 → 1.2.2. pnpm lock: compression ya estaba corregido; source-map-js pasa a 1.2.2. Ambos cambios satisfacen los rangos existentes. Sin overrides nuevos, cambios de Expo/RN ni modificación de parches previos. Se descarta la salida amplia de pnpm update; la instalación congelada valida el lock acotado.

## Evidencia

Instalaciones npm y pnpm 9.15.9 con scripts deshabilitados; ejecución explícita posterior del postinstall revisado (patch-package). Ambos aplican braces y node-forge. Suite completa con cada gestor: 18 archivos, 339 pruebas aprobadas, incluidas regresiones previas de braces, node-forge y shell-quote. Typecheck, lint y formato aprobados.

Las dos regresiones nuevas resuelven dependencias a través de Expo y corren en procesos con timeout: rechazo de un mapa indexado con offset excesivo, conservación del contenido de un mapa normal y destrucción del stream gzip al abortar una respuesta HTTP local comprimida.

## Advisories y riesgo residual

| Advisory                                                                               | Cadena y estado                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [compression GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)   | Expo CLI → servidor Metro. Corregido con 1.8.2. Un servidor accesible podía agotar memoria con respuestas comprimidas abortadas. |
| [source-map-js GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | metro-config → PostCSS. Corregido con 1.2.2; mapas manipulados podían bloquear el proceso.                                       |
| [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)        | micromatch → Metro y patch-package. Sin versión upstream corregida; parche local y cinco regresiones conservados.                |
| [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)    | Expo CLI / code-signing-certificates. Sin versión upstream corregida; parche local y regresión de firma RSA conservados.         |

Audit npm posterior: **21 paquetes high derivados de dos advisories únicos**, frente a 23 y cuatro antes. Los otros 19 registros propagan braces/node-forge por Expo/Metro/RN y herramientas. El escáner por versiones no reconoce parches locales. No se ejecuta audit fix ni se cierran alertas manualmente; las sugerencias automáticas incluyen retrocesos incompatibles.

Ser herramientas no elimina exposición durante desarrollo, CI, builds o firma. Binarios publicados, EAS, accesibilidad de servidores y candidato web integrado siguen sin verificarse. El lock raíz local ya contiene compression 1.8.2/source-map-js 1.2.2; no demuestra el estado desplegado. Sin cambios raíz, remotos ni publicación.
