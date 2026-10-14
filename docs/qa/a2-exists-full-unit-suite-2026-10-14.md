# Suite unitaria completa — candidato A2 EXISTS

## Candidato y aislamiento

- Candidato inmutable: `5e2105bdd887f4a3de2a17af5bc48fed83a3ef19` (`fix: bound owner existence subqueries`).
- Corrida desde el worktree detached `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-a2-exists-limits-suite-20261014`; HEAD se comprobó antes y después y permaneció en ese SHA.
- Se reutilizó `node_modules` del checkout local en `0a1bcd1dee3087437b664987cca5168c16555906`. `package.json`, `pnpm-lock.yaml` y `vitest.config.ts` no difieren entre ambos commits. No se instalaron dependencias.
- Vitest instalado: `4.1.11`, una sola versión del paquete en el store pnpm; la lista del proyecto raíz también resuelve una sola versión. La app móvil declara `4.1.11` y no se encontró un árbol `mobile/node_modules` separado.

## Ejecución

- Comando: `pnpm exec vitest run --reporter=dot`.
- Exit code: `0`.
- Duración de pared medida por el wrapper: `247 s`; duración informada por Vitest: `245.42 s`.
- Archivos: `510 passed`, `1 skipped` de `511`.
- Pruebas: `2680 passed`, `3 skipped` de `2683`; `0 failed`.
- El reporter `dot` no mostró los nombres individuales de los elementos omitidos.

## Warnings y limpieza

- pnpm avisó que `pnpm.overrides` dentro de `package.json` ya no se lee.
- Hubo `3` warnings React `act(...)` en `OwnerEnrollmentsManager`, emitidos por su prueba.
- No se modificaron timeouts, retries, workers ni exclusiones.
- Después de salir Vitest, el escaneo de procesos no encontró `vitest`, `vite-node` ni `tinypool` activos. El worktree candidato permaneció limpio y en el SHA exacto.

## Alcance

Esta evidencia cubre la suite unitaria local del candidato. No ejecuta PostgreSQL, navegador, E2E, servicios, CI, Sandbox ni producción y no declara release readiness.
