# Excepción temporal de auditoría: GHSA-fc5q-39xc-vjpf en `picomatch`

**Estado:** excepción activa desde 2026-11-17. **Fecha de revisión: 2026-12-17.**
**Retirar la excepción en cuanto salga `picomatch@4.0.8` (o posterior) con el arreglo.**

## Hallazgo

El advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
(CVE-2026-112366, gravedad alta) describe una denegación de servicio por
expresión regular (ReDoS) en `picomatch` hasta la 4.0.7: un glob de extglob
repetido de una sola rama, como `+(*)` o `+(*a)`, provoca retroceso exponencial
y bloquea el bucle de eventos de Node.js. Se publicó el 2026-10-19 y se
actualizó el 2026-11-17; desde entonces el job «Dependency Security & SBOM»
(`pnpm audit --audit-level high --prod`) falla en todas las PR.

**No hay versión corregida.** El advisory lista `first_patched_version: null`
para `<= 4.0.7`; a 2026-11-17 la última versión en npm es la 4.0.7 (24-08-2026)
y no hay lanzamiento parcheado en las líneas 2.x ni 3.x. Por eso no se puede
subir la versión ni fijar un `pnpm.overrides` a una versión corregida: no
existe. Un parche local (como el de `braces`) no cambiaría el resultado de
`pnpm audit`, que compara versiones.

## Por qué es seguro hoy

- En producción (`--prod`) el lockfile resuelve `picomatch@4.0.7` por un único
  camino: `@sentry/nextjs@10.76.2 > @rollup/plugin-commonjs@28.0.1 > picomatch`.
- `@sentry/nextjs` usa ese plugin en `build/*/config/loaders/wrappingLoader.js`,
  el cargador de webpack que envuelve rutas y páginas **al compilar**. Lo
  invoca con opciones fijas (`sourceMap`, `strictRequires`,
  `ignoreDynamicRequires`, `ignore() { return true }`) y sin patrones de
  `include` o `exclude` definidos por usuarios. No se ejecuta al atender
  peticiones.
- El código de producto (`src/`, `scripts/`, middleware, `next.config.*`,
  configuración de Sentry) no importa `picomatch`, `micromatch`, `minimatch`,
  `anymatch`, `tinyglobby`, `fast-glob`, `globby` ni `readdirp`: comprobado con
  `git grep` el 2026-11-17. Ninguna ruta de ejecución pasa texto de usuarios a
  un matcher de globs.
- Las demás copias (`vite`/`vitest`/`tinyglobby` con 4.0.7 y `tailwindcss >
  micromatch` con 2.3.2) son solo de desarrollo, no entran en `--prod` y los
  patrones salen de configuración del repo.

El riesgo real de este advisory exige que un atacante controle el patrón. Aquí
los patrones son fijos y se evalúan al compilar, así que la excepción no
amplía la superficie expuesta.

## Cambio

- `package.json`: `pnpm.auditConfig.ignoreGhsas` con **solo** este GHSA.
  `pnpm@9.15.9` (el fijado en `packageManager`) lo lee de
  `rootProjectManifest.pnpm.auditConfig.ignoreGhsas`. No toca el lockfile ni
  las versiones instaladas, y no oculta ningún otro advisory.
- Este documento y la entrada de `vault/06-Roadmap-y-Tareas/Changelog interno.md`.

## Qué hay que hacer después

1. Vigilar [micromatch/picomatch](https://github.com/micromatch/picomatch): a
   2026-11-17 no hay arreglo fusionado ni lanzamiento (el PR #194 que cita el
   advisory es otro cambio y sigue abierto).
2. Cuando salga `4.0.8` con el arreglo: subir `picomatch` (a través de
   `@rollup/plugin-commonjs`/`@sentry/nextjs`, o con un `pnpm.overrides`
   acotado a `picomatch@<=4.0.7`), **quitar `auditConfig.ignoreGhsas` de
   `package.json`** y borrar este documento o marcarlo como cerrado.
3. El 2026-12-17, si sigue sin versión corregida, revisar de nuevo si la
   justificación se mantiene (nuevos usos de globs con entrada de usuario,
   cambios en cómo `@sentry/nextjs` usa el plugin) y renovar o retirar la
   excepción.
