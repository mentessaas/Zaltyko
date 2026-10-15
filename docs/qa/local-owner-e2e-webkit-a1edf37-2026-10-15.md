# E2E Owner local WebKit — candidato a1edf37 (2026-10-15)

## Resultado

**PASS local en WebKit.** La ejecución seleccionó únicamente el proyecto `webkit`: un test, un worker, 23,5 s de test (32,8 s en el resumen de Playwright). El runner completó la limpieza del stack; `test-results/.last-run.json` indica `status: passed` y `failedTests: []`. SHA probado: `a1edf37d56ac2b1d9f21a1bfa49a62c7b58bb681`.

El flujo UI registró al Owner, creó academia y sede, grupo, gimnasta, dos clases e inscripciones activas; guardó asistencia presente; emitió una cuota mensual de 35,00 € con una línea de gimnasta que cubre ambas clases; y registró el pago manual por transferencia. El dashboard mostró 1 gimnasta activa, 1 grupo activo, 1 asistencia y 1 cobro por 35,00 €. La consulta SQL del test confirmó las filas persistidas para grupo, gimnasta, plantillas/sesiones/inscripciones, familia y pagador, cobertura de tarifa, asistencia, factura/línea/coberturas, cargo pagado y pago manual.

El dashboard pasó a 375, 768 y 1280 px; el test verificó contenido e importe del resumen y ausencia de scroll horizontal. Las rutas de grupos, opciones de pagos manuales y dashboard devolvieron 403 ante organización o sede ajena; pagos manuales y dashboard devolvieron 403 para coach. Esas comprobaciones son GET; no afirman denegación de todas las mutaciones.

## Checkout y entorno

- Worktree detached frío en `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-run-a1edf37-webkit-cold-20261015`, HEAD exacto al iniciar. `.next`, `test-results` y `playwright-report` no existían antes de la ejecución; no se reutilizaron salidas ni caché de Chromium o Firefox.
- Node `v22.22.3` por ruta absoluta. Los hashes de `package.json` y `pnpm-lock.yaml` coincidían con las dependencias locales existentes; no se instalaron paquetes. Las salidas de build y Playwright quedaron en el worktree de WebKit.
- Supabase CLI `2.84.2`, SHA-256 `c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f`; 13/13 imágenes requeridas presentes. Docker usó contexto `orbstack` y socket Unix local. Sin pull.
- Entorno limpio con PATH `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, `E2E_LOCAL_PROJECT=webkit`, Node absoluto y CLI JS local de tsx. Sin pnpm, Corepack ni npx. WebKit no recibió permiso LNA.
- Build dentro del límite de 240 s; test con límite de 300 s y 0 reintentos.

Comando:

```sh
env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/elvisvaldesinerarte TMPDIR=/tmp LANG=en_US.UTF-8 E2E_LOCAL_PROJECT=webkit /Users/elvisvaldesinerarte/.local/bin/node /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-run-a1edf37-webkit-cold-20261015/node_modules/tsx/dist/cli.mjs scripts/run-e2e-local.ts
```

## Cleanup y alcance

- El runner informó `Supabase local stack stopped and disposable data volumes removed.` La comprobación posterior no encontró contenedores, volúmenes, redes ni directorios temporales `zaltyko-e2e-local-*`; tampoco quedaron procesos propios del runner, Supabase, Next o Playwright.
- El checkout de WebKit mantiene limpios sus archivos versionados en el SHA probado; sus salidas ignoradas quedan aisladas en ese worktree. Los worktrees de Chromium y Firefox conservan el mismo SHA y no se modificaron en esta pasada.
- El harness bloquea service workers para que Playwright observe las solicitudes; esta suite **no valida el comportamiento del service worker**. No se ejecutaron sandbox, producción ni servicios remotos.
- Evidencia local de este SHA; no acredita CI, despliegue ni producción.
