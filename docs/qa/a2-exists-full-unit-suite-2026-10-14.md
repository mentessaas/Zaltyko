# Corrida de suite unitaria en SHA distinto del autorizado

> **Evidencia no válida para el SHA autorizado de Main.** Se solicitó ejecutar la suite sobre `0a1bcd1dee3087437b664987cca5168c16555906`, pero el comando se ejecutó en otro checkout, fijado a `5e2105bdd887f4a3de2a17af5bc48fed83a3ef19`. No se debe atribuir este resultado a Main ni declarar completo su gate de suite.

## Candidato y aislamiento

- SHA autorizado: `0a1bcd1dee3087437b664987cca5168c16555906`.
- SHA realmente probado: `5e2105bdd887f4a3de2a17af5bc48fed83a3ef19` (`fix: bound owner existence subqueries`).
- Ruta real de ejecución: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-a2-exists-limits-suite-20261014` (worktree detached).
- El wrapper comprobó `git rev-parse HEAD` antes y después de la corrida; ambas comprobaciones devolvieron `5e2105bdd887f4a3de2a17af5bc48fed83a3ef19`. El commit no coincide con el SHA autorizado.
- Se reutilizó `node_modules` del checkout local en `0a1bcd1dee3087437b664987cca5168c16555906`. `package.json`, `pnpm-lock.yaml` y `vitest.config.ts` no difieren entre ambos commits. No se instalaron dependencias.
- Vitest instalado: `4.1.11`, una sola versión del paquete en el store pnpm; la lista del proyecto raíz también resuelve una sola versión. La app móvil declara `4.1.11` y no se encontró un árbol `mobile/node_modules` separado.

## Resultado observado únicamente en `5e2105bd`

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

El exit `0` y los conteos anteriores describen exclusivamente la corrida local de `5e2105bd`. No son evidencia de la suite del SHA autorizado `0a1bcd1`; esa suite permanece sin verificar y no se repitió.

La corrida no ejecutó PostgreSQL, navegador, E2E, servicios, CI, Sandbox ni producción y no declara release readiness.
