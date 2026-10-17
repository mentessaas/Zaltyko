# Fallback por digest: preparación QA e integración local — 2026-10-15

## Estado

Preparación inicial aislada en QA `efde620b`; Main la conectó posteriormente al precargador en el checkout de integración. Ningún Docker, pull, login, cambio remoto de registry, runner o nueva ejecución CI se ha realizado para esta integración. El precargador conserva el guard GitHub Actions, daemon local, entorno filtrado e inspección de imágenes presentes. La causa de build240s sigue abierta: el diagnóstico añadido no es una corrección de esa causa.

## Archivos preparados

- `scripts/lib/local-e2e-digest-pins.ts`: 13 mapeos ECR→Hub, digest de manifiesto linux/amd64 y digest de config obtenidos en la consulta de metadata anterior. [Procedencia](./ci-firefox-build-images-evidence-2026-10-15.md).
- `scripts/lib/local-e2e-digest-fallback.ts`: función sin entrypoint ni ejecución al importar; dependencia Docker inyectada.
- `tests/local-e2e-digest-fallback.test.ts`: 42 tests mock, PASS con `pnpm exec vitest run tests/local-e2e-digest-fallback.test.ts --project web` (480 ms, 2026-10-15).

## Contrato conectado por Main

En `preloadLocalE2eImages`, conservar guard GitHub Actions, resolución de daemon y entorno filtrado, info inicial e inspección de imágenes presentes. Para cada imagen ausente, sustituir el bloque de pull por:

```ts
await pullPinnedImageWithDigestFallback(
  image,
  (args, timeoutMs) => run(args, dockerEnvironment, timeoutMs)
);
```

La función ejecuta primero ECR con plataforma linux/amd64. Solo status entero positivo y un indicador rate-limit sin indicadores adicionales conocidos permiten UNA llamada alternativa a `docker pull --platform linux/amd64 docker.io/repo@sha256:...`. Una excepción/timeout, status null, negativo, fraccionario o no finito no permite alternativa. No se renueva el presupuesto: los 600 s originales por imagen se comparten entre ECR, Hub, inspecciones y retag; no hay retries. No hay un nuevo timeout global de todas las imágenes.

Tras Hub, `image inspect` debe devolver un único objeto con `Os=linux`, `Architecture=amd64`, `Id=config SHA256` y RepoDigests conteniendo exactamente el repo Hub y digest esperados. Solo entonces se retaggea el ID de config verificado al ref ECR original. Se revalida el ref ECR tras retag. No se exige un RepoDigest ECR nuevo: un tag local no genera un manifiesto remoto ECR. Se conserva/verifica la procedencia Hub. Cualquier discrepancia falla cerrada, sin otro pull. Las capas ya están vinculadas por el manifiesto fijado, y Docker comprueba sus hashes durante pull; no se inventa una validación local de hashes de capas comprimidas usando RootFS DiffIDs.

No se añaden variables registry ni se cambia el CLI Supabase. La restricción linux/amd64 es deliberada; no habilitar para Mac arm64. El módulo no acepta digest suministrado por entorno y no imprime stdout/stderr ni errores arbitrarios de Docker.

## Límites pendientes

No se ha comprobado con Docker real ni se afirma cuota disponible en Hub. RepoDigests usa el nombre canónico sin `docker.io`; cualquier normalización diferente falla cerrada (incluido posible alias `kong` frente a `library/kong`). Resolver mediante evidencia metadata/local autorizada antes de ampliar aliases, nunca omitir la comprobación. No hay evidencia runtime de que Supabase evite pulls después del retag; deberá verificarse en un run posterior autorizado. Este módulo es preparado para revisión, no un desbloqueo CI demostrado.

## Changelog

2026-10-15: añadidos helper, pins y tests en checkout QA. Sin cambios remotos ni integración. Pruebas mock 42/42 PASS. No se ejecutó E2E ni Docker. No se modifica readiness de producción.

## Refuerzo previo al snapshot local

El reloj se comprueba antes Y después de cada comando, incluso si el comando tiene éxito o lanza una excepción: finito, monotónico y dentro de los mismos 600 s. Un reloj inválido tras el pull ECR exitoso impide devolver éxito. Los tests cubren NaN, infinito, regresión temporal, límite exacto, JSON inválido, formas inválidas de inspect, identidad distinta tras retag exitoso y throws con undefined/null/string/Error.

`local-e2e-docker-diagnostics.ts` extrae únicamente las categorías fijas del sanitizador actual. `DigestFallbackError` expone stage (enum), status numérico/null, reason fijo y flags fijos; no almacena stderr, stdout, errores originales ni cause. La llamada fallida primaria conserva status y categorías en el mensaje. El wrapper puede usar sus campos sin volver a clasificar salida arbitraria. Al integrar, reutilizar este extractor desde el sanitizador existente conserva su contrato y evita importar el precargador desde el helper (sin ciclo); no se modificó el precargador ausente en esta base QA.

Validación del refuerzo: 42/42 tests mock PASS, duración 480 ms. Ningún runner, Docker o CI ejecutado. Snapshot solicitado solo local, sin push.

## Evidencia de integración Main

- Revisión Frontend detectó que status null con stderr429 podía iniciar alternativa. Main lo cerró con guard entero positivo y cinco regresiones; no se aceptó ese estado intermedio para push.
- Pruebas Main: 80/80 PASS en cinco archivos (47 helper, 15 preloader, 3 contratos CI, 5 seguridad del runner y 10 diagnóstico), 2,78s. Comprueban también igualdad exacta de los 13 pins y entorno filtrado en todas las llamadas. Sin Docker real.
- El módulo de diagnóstico compartido conserva categorías fijas y descarta salida arbitraria. Errores del wrapper no incluyen causa original ni stdout/stderr.
- Runtime remoto, cuota Hub, normalización RepoDigests y ausencia de nuevos pulls de Supabase: pendientes de comprobar en una única corrida del nuevo candidato revisado. Build240s, esquema/recuperación, seguridad residual y aprobación PR siguen siendo gates separados.
