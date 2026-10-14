# Runner de restore sintético local — 14-10-2026

## Alcance

La rama `codex/synthetic-restore-local-20261014` añade un runner manual y
efímero para ensayar backup/restauración en dos bases PostgreSQL de loopback.
La fuente se prepara con las migraciones canónicas requeridas, consentimiento
canónico sintético y el harness de operaciones existente. Después se genera
un dump custom, se verifica SHA-256, se restaura en una base vacía y se compara
el esquema y el catálogo financiero/RLS/constraints/triggers/grants.

El fixture del harness contiene una factura mensual por atleta, dos clases en
uno de los atletas, snapshots de cobertura, cargos, un pago manual sintético y
un consentimiento sintético. No importa filas ni identidades de Supabase y no
llama a Stripe. Las utilidades PostgreSQL reciben únicamente URLs a
`127.0.0.1`; los procesos de Node arrancan con un entorno reducido mediante
`env -i`. Un `trap` detiene el clúster y borra el directorio temporal.

## Estado de verificación estática

- `bash -n scripts/run-zaltyko-synthetic-restore-local.sh`: PASS.
- `git diff --check`: PASS.
- No ejecutado: `tests/synthetic-restore-runner-contract.test.ts` y
  `pnpm typecheck`; este worktree no tiene `node_modules`, por lo que `vitest`
  y `tsc` no están disponibles. No se instalaron dependencias mientras QA
  sigue activo.

Incluso cuando estén disponibles, las verificaciones estáticas no equivalen a
un restore PostgreSQL ejecutado.

## Ejecución bloqueada hasta cierre/revisión de QA

No ejecutar `pnpm test:zaltyko-synthetic-restore:local` todavía. En el último
parte recibido, WebKit pasó y Firefox seguía bajo diagnóstico. Main debe cerrar
QA, revisar este SHA y autorizar expresamente el runner. Hasta entonces no se
arranca PostgreSQL, no se ejecuta el harness operativo y no se crean dumps.

Después de la autorización, el único comando de ejecución es:

```bash
pnpm test:zaltyko-synthetic-restore:local
```

El resultado esperado debe registrar `status=PASS`, conteo/versionado de
migraciones, checksum del dump, igualdad de catálogo, conciliación de factura,
RLS, restricciones de inmutabilidad y cleanup. Aunque pase, solo demostrará una
restauración local con datos sintéticos; no acredita un restore de Preview o
producción, ni sustituye la revisión de compatibilidad remota.
