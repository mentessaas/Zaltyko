# Readiness E2E: mensualidades y sandbox local — 13-10-2026

## Estado observado

**E2E de mensualidades: pendiente. Harness local: preparado, pero su recorrido de navegador no está demostrado.** Este checkout es `codex/mvp-monthly-billing-local-e2e-20261013`, basado en `51c0ac5bd71fd344e1a634b7f68d12dc7accd388`. No se usaron datos, credenciales ni servicios Supabase remotos.

## Evidencia

- El repositorio tiene 110 migraciones históricas y no incluye `supabase/config.toml`. Un arranque local con todas las migraciones se detuvo en `0006_add_class_exceptions.sql` porque aún no existe la relación `classes`.
- Un proyecto temporal Supabase con la allowlist de 16 migraciones greenfield de `scripts/lib/e2e-domain-migrations.ts` sí llegó a levantar Postgres, Auth, REST y los demás servicios locales. Se detuvo con `--no-backup`; no se conservaron sus volúmenes.
- `pnpm exec tsc --noEmit --pretty false` y `git diff --check` pasaron tras los ajustes de aislamiento del puerto.
- La primera repetición Chromium falló en `loginThroughUi`: no observó un POST a Auth. La segunda, con diagnóstico sin valores sensibles, concluyó `input lengths=0/0`, `page errors=none` y, en el reintento, una petición fallida a `127.0.0.1:3000/_next/static/chunks/app/error.js`. No se llegó a ejecutar bootstrap ni se demostró la limpieza de una academia creada por UI.
- Se intentó aislar el servidor Next en un puerto libre. Esa repetición no alcanzó a arrancar: `tsx` rechazó el `await` de nivel superior en modo CommonJS. Se corrigió el runner para usar una función async, pero, siguiendo la instrucción de no repetir más pruebas de varios minutos, ese arreglo aún no tiene ejecución de validación.
- Tras interrumpir, `docker ps` y `ps` no mostraron contenedores `zaltyko-e2e-local` ni procesos del runner, Playwright, Next o `supabase start`.

## Qué cubre el harness preparado

`pnpm test:e2e:local` crea un proyecto Supabase desechable con ID y directorio únicos, aplica solo la allowlist greenfield, limita las variables de entorno heredadas, configura Stripe con valores `test` ficticios y elimina el stack y su directorio temporal al terminar. La suite crea una identidad Auth sintética local; el navegador intenta iniciar sesión y crear academia/sede desde `/owner/setup`; SQL queda limitado a verificar y borrar la organización de esa identidad generada. La CI añade un job independiente sin secretos de sandbox remoto.

Estas son propiedades del código del harness, no una prueba de que el spec complete el flujo. El job CI añadido tampoco se ha ejecutado en este checkout y está marcado `continue-on-error: true` como experimental; no bloquea los demás gates.

## Bloqueos para el E2E de mensualidades

En la auditoría del producto se encontró UI de pagos para listar cargos y registrar pagos manuales, y una preferencia de cobro familiar. No se encontró un flujo/API mensual greenfield para previsualizar y emitir cargos, ni un contrato acordado para alta mensual por gimnasta a la tarifa asignada. La emisión aparece como servicio, sin endpoint de UI identificado. La ruta de asistencia greenfield también sigue sin contrato/API de UI identificado.

Antes del spec mensual hacen falta:

1. Integrar el contrato de facturación mensual y su flujo frontend: vista previa; confirmación que emita cargos pendientes; pago manual; actualización del dashboard. Acordar reintentos idempotentes y respuesta `409` cuando la vista previa haya quedado obsoleta.
2. Proveer un helper de sandbox namespaced para datos de prueba y limpieza por IDs generados, o completar el ciclo desde UI en el mismo test.
3. Definir el flujo de asistencia greenfield si forma parte del recorrido de aceptación.
4. Validar el harness local corregido en Chromium y, después, ejecutar el job CI aislado. Solo entonces ampliar la suite a los escenarios mensuales y comprobar la eliminación al finalizar.

## Alcance que no se puede afirmar

No se ha demostrado el recorrido de alta → deportistas → grupo/clase → inscripción → asistencia → emisión mensual → pago manual → dashboard. Tampoco se han probado errores Auth con backend, idempotencia de emisión, conflicto por vista previa obsoleta, fallos reales de API, aislamiento del tenant mediante una sesión E2E completa, CI del nuevo job, sandbox remoto, Stripe Live, despliegue ni producción. El fallo de chunk observado no establece todavía una causa raíz.
