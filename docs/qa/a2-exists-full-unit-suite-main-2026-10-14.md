# Suite unitaria completa — SHA autorizado de Main

## Candidato y preflight

- SHA probado: `0a1bcd1dee3087437b664987cca5168c16555906`.
- Worktree detached: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-a2-exists-suite-main-preflight-20261014`.
- El wrapper verificó ruta, HEAD exacto y estado Git limpio antes de ejecutar. Al terminar, `HEAD_AFTER` siguió siendo el mismo SHA y `STATUS_AFTER=0`.
- Se enlazaron dependencias locales existentes desde `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-monthly-billing-local-e2e-20261013/node_modules`; no se instalaron paquetes. `package.json`, `pnpm-lock.yaml` y `vitest.config.ts` coincidían con el checkout local de referencia. Vitest resuelto: `4.1.11`, una sola versión instalada.

## Ejecución y resultado

- Comando: `pnpm exec vitest run --reporter=dot`.
- Exit code: `0`.
- Tiempo medido por wrapper: `247 s`; duración informada por Vitest: `245.73 s`.
- Archivos: `512 passed`, `1 skipped` de `513`.
- Pruebas: `2689 passed`, `3 skipped` de `2692`; `0 failed`.
- El reporter `dot` no identificó los elementos omitidos individualmente.

## Warnings y cleanup

- pnpm avisó que `pnpm.overrides` dentro de `package.json` ya no se lee.
- Hubo `3` warnings React `act(...)` en la prueba de `OwnerEnrollmentsManager`.
- No se cambiaron timeouts, retries, workers ni exclusiones.
- El escaneo posterior no encontró procesos `vitest`, `vite-node` o `tinypool` activos. El checkout probado permaneció limpio y en el SHA autorizado.

## Alcance y trazabilidad

Esta es la corrida unitaria correcta para `0a1bcd1`. La corrida previa en `5e2105bd` fue de otro SHA; su resultado pertenece únicamente a ese checkout y no sustituye esta evidencia ni debe presentarse como resultado de Main. Este informe cubre solo la suite unitaria local; no incluye PostgreSQL, navegador, E2E, servicios, CI, Sandbox o producción y no declara release readiness.
