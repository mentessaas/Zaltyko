# E2E Owner local Firefox — candidato a1edf37 (2026-10-15)

## Resultado

**PASS local en Firefox.** La ejecución seleccionó únicamente el proyecto `firefox`: un test, un worker, 31,0 s en el resumen de Playwright y exit code 0. SHA probado: `a1edf37d56ac2b1d9f21a1bfa49a62c7b58bb681`. `test-results/.last-run.json` terminó con `status: passed` y `failedTests: []`.

El flujo UI registró al Owner, creó academia y sede, grupo, gimnasta, dos clases e inscripciones activas; guardó asistencia presente; emitió una cuota mensual de 35,00 € con una línea de gimnasta que cubre ambas clases; y registró el pago manual por transferencia. El dashboard mostró 1 gimnasta activa, 1 grupo activo, 1 asistencia y 1 cobro por 35,00 €. La consulta SQL del test confirmó las filas persistidas, incluidos Owner, grupo, gimnasta, 2 plantillas, sesiones, 2 inscripciones, familia y pagador, 2 coberturas de tarifa, asistencia, factura/línea/coberturas, cargo pagado y pago manual.

El dashboard pasó a 375, 768 y 1280 px; el test verificó contenido e importe del resumen y ausencia de scroll horizontal. Las rutas de grupos, pagos manuales y dashboard devolvieron 403 ante organización o sede ajena; pagos manuales y dashboard devolvieron 403 para coach.

## Checkout y entorno

- Worktree detached nuevo en `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-run-a1edf37-firefox-cold-20261015`, HEAD exacto al iniciar. No existían `.next`, `test-results` ni `playwright-report`; no se reutilizó caché/build/manifiestos de Chromium.
- Node `v22.22.3` por ruta absoluta; dependencias locales existentes tras comparar hashes iguales de `package.json` y `pnpm-lock.yaml`. El `node_modules` compartido era solo el árbol de dependencias ya verificado; las salidas de build y Playwright fueron propias de este worktree. Sin instalación.
- Supabase CLI `2.84.2`, SHA-256 `c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f`; 13/13 imágenes requeridas presentes. Docker usó contexto `orbstack` y socket Unix local. Sin pull.
- Entorno limpio con PATH `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, `E2E_LOCAL_PROJECT=firefox`, Node absoluto y el CLI JS local de tsx. Sin pnpm, Corepack ni npx. El grant de `local-network-access` está limitado a Chromium en el código; Firefox no recibió ese permiso.
- El build permaneció dentro del límite de 240 s y el test usó los 300 s configurados, sin retries.

Comando:

```sh
env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/elvisvaldesinerarte TMPDIR=/tmp LANG=en_US.UTF-8 E2E_LOCAL_PROJECT=firefox /Users/elvisvaldesinerarte/.local/bin/node /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-run-a1edf37-firefox-cold-20261015/node_modules/tsx/dist/cli.mjs scripts/run-e2e-local.ts
```

## Cleanup y alcance

- El runner informó `Supabase local stack stopped and disposable data volumes removed.` La comprobación posterior no encontró contenedores, volúmenes, redes ni directorios temporales `zaltyko-e2e-local-*`; tampoco quedaron procesos propios del runner, Supabase, Next o Playwright.
- El checkout de Firefox mantiene limpios sus archivos versionados en el SHA probado. Sus salidas ignoradas `.next`, `playwright-report` y `test-results` quedan aisladas en ese worktree.
- Chromium conserva su checkout y artefactos sin modificar. No se ejecutó WebKit; este resultado por sí solo no autoriza ni acredita esa corrida.
- Evidencia local de este SHA; no acredita CI, sandbox, despliegue ni producción.
