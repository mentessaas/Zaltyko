# E2E Owner Chromium local — candidato a1edf37 (2026-10-15)

## Resultado

**PASS local en Chromium.** El runner terminó con exit code 0: un test, un worker, 21,5 s de test (30,6 s en el resumen de Playwright). El SHA probado fue a1edf37d56ac2b1d9f21a1bfa49a62c7b58bb681.

El recorrido alcanzó el roster de asistencia, guardó asistencia, emitió una cuota y registró un pago manual por 35,00 €. El dashboard mostró 1 gimnasta activa, 1 grupo activo, 1 registro de asistencia y 1 cobro en el periodo. La consulta SQL del test confirmó las filas persistidas para grupo, gimnasta, dos plantillas/sesiones/inscripciones, vínculo y pagador familiar, cobertura de tarifa, asistencia, factura/línea/coberturas, cargo pagado y pago manual.

El dashboard pasó a 375, 768 y 1280 px; el test comprobó contenido del resumen, importe y ausencia de scroll horizontal. Los endpoints de grupos, pagos manuales y dashboard devolvieron 403 con organización o sede ajena; pagos manuales y dashboard devolvieron 403 para rol coach.

## Checkout, entorno y caché

- Checkout detached nuevo en el SHA exacto, limpio antes de la corrida. No existían .next ni resultados Playwright. No se reutilizó caché, build ni manifiestos previos.
- Node v22.22.3 por ruta absoluta; Next.js 15.5.27; tsx 4.23.13. package.json y pnpm-lock.yaml coincidían con node_modules preexistente verificado; no se instalaron dependencias.
- Docker usó el socket Unix local de OrbStack; Supabase CLI 2.84.2 coincidió con el SHA-256 fijado por el runner y las 13 imágenes del manifiesto estaban locales. Sin pull.
- PATH de ejecución: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin. E2E_LOCAL_PROJECT=chromium. Se invocó Node absoluto y el CLI JS local de tsx; sin pnpm, Corepack ni npx.

Comando:

```sh
set -o pipefail; env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/elvisvaldesinerarte TMPDIR=/tmp LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 E2E_LOCAL_PROJECT=chromium /Users/elvisvaldesinerarte/.local/bin/node /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-run-a1edf37-chromium-cold-20261015/node_modules/tsx/dist/cli.mjs scripts/run-e2e-local.ts 2>&1 | tee /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/qa-evidence-a1edf37-chromium-20261015/runner.log
```

## Evidencia y cleanup

- Log: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/qa-evidence-a1edf37-chromium-20261015/runner.log — SHA-256 adf7e4d6cfa3848eadb6dcb85985af2f74e19ebf7f711ca973909ae3042ac573.
- El runner informó que detuvo Supabase y eliminó volúmenes. La comprobación posterior no encontró contenedores, volúmenes, redes, directorios temporales zaltyko-e2e-local-* ni procesos del runner/Next/Playwright. Los archivos versionados del checkout siguen limpios en el SHA probado.
- Playwright no generó trace al pasar; test-results solo contiene .last-run.json. No se ejecutaron Firefox ni WebKit. El resultado es evidencia local de este SHA; no acredita CI, despliegue, Sandbox ni producción.
