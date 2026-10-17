# Runner de restore sintético local — 14-10-2026

## Resultado vigente de Main

**PASS también en PostgreSQL 17.11 local**, exit 0, cleanup PASS. Mismos
59 tablas, 484 restricciones, 49 políticas, nueve triggers, conciliación,
ocho controles de inmutabilidad y aislamiento del consentimiento.
El primer arranque PG17 falló por locale en macOS; se añadió `LC_ALL=C`
al entorno aislado tras capturar el diagnóstico concreto del servidor.
No acredita backup ni restore del Sandbox remoto: sigue siendo dato sintético.

**PASS local**, dos ejecuciones completas tras el fixture independiente.
La última valida versión mayor PostgreSQL 14 (corregida extracción Homebrew),
backup/restore entre dos bases efímeras y catálogos equivalentes: 59 tablas,
484 restricciones, 49 políticas y nueve triggers. Ledger de noviembre creado
por servicios: factura 12.000 céntimos, pago parcial de un céntimo, conciliado;
ocho controles de inmutabilidad y lectura cruzada de consentimiento denegada.
Once migraciones con manifest SHA-256 registrado por el runner. Cleanup PASS,
exit 0. Octubre `void` se comprueba solo como fidelidad del fixture de guard.
No demuestra recuperación remota ni RPO/RTO. Los fallos siguientes son historia.

Seis pruebas estáticas, tipos y lint PASS. Tres ejecuciones locales terminaron
FAIL con cleanup PASS. Se corrigieron arranque CJS y comparación de posiciones
lógicas de columnas (pg_dump compacta huecos de columnas eliminadas).
La tercera ejecución pasó la comparación del catálogo restaurado, pero falló
por esperar una factura parcialmente pagada: el fixture operativo deja esa
factura en `void` deliberadamente. Backend revisa el contrato del fixture;
no se harán más ejecuciones hasta decidir la corrección. **Restore completo
NO VALIDADO**. Ninguna conexión remota ni restauración de datos reales.

## Alcance

La rama `codex/synthetic-restore-fixture-nov-20261014` contiene el runner
manual y efímero para ensayar backup/restauración en dos bases PostgreSQL de
loopback.
La fuente se prepara con las migraciones canónicas requeridas, el harness
operativo existente y una fixture independiente de noviembre creada con los
servicios de emisión mensual y pago manual. Esa factura se identifica mediante
claves de idempotencia sintéticas y queda parcialmente pagada por un céntimo.
También se inserta el consentimiento canónico sintético. Después se genera un
dump custom, se verifica SHA-256, se restaura en una base vacía y se compara
estructuralmente el catálogo (columnas, constraints, RLS, policies, triggers,
grants y extensiones), además del ledger. Comprueba que `initdb`, `pg_ctl`,
`psql`, `createdb`, `pg_dump` y `pg_restore` compartan la misma versión mayor.

La factura de octubre anulada por SQL en el harness solo se usa como fixture del
guard de reemisión y se comprueba por fidelidad de restore; el checker no la
presenta como un ciclo válido de anulación. La factura financiera objetivo es
la de noviembre, emitida y pagada por los servicios reales. No importa filas ni
identidades de Supabase y no llama a Stripe. Las utilidades PostgreSQL reciben únicamente URLs a
`127.0.0.1`; los procesos de Node arrancan con un entorno reducido mediante
`env -i`. Un `trap` detiene el clúster y borra el directorio temporal.

## Estado de verificación estática

- `bash -n scripts/run-zaltyko-synthetic-restore-local.sh`: PASS.
- `git diff --check`: PASS.
- `pnpm exec vitest run tests/synthetic-restore-runner-contract.test.ts`: 8/8
  PASS.
- `pnpm typecheck`: PASS.
- ESLint focal para los dos scripts TypeScript y el contrato: PASS.
- Prettier para los tres archivos TypeScript: PASS.
- Dependencias disponibles mediante
  `pnpm install --offline --frozen-lockfile` (cero paquetes descargados).

Estas verificaciones no equivalen a un restore PostgreSQL ejecutado.

## Ejecución bloqueada hasta cierre/revisión de QA

No ejecutar `pnpm test:zaltyko-synthetic-restore:local` todavía. En el último
parte recibido, WebKit pasó y Firefox seguía bajo diagnóstico. Main debe cerrar
QA, revisar este SHA y autorizar expresamente el runner. Hasta entonces no se
arranca PostgreSQL, no se ejecuta el harness operativo y no se crean dumps.

El cleanup borra solo el directorio temporal validado después de confirmar que
el servidor se detuvo. Si `pg_ctl stop` falla o su estado no puede confirmarse,
preserva el directorio y muestra su ruta de recuperación. Después de la
autorización, el único comando de ejecución es:

```bash
pnpm test:zaltyko-synthetic-restore:local
```

El resultado esperado debe registrar `status=PASS`, conteo/versionado de
migraciones, checksum del dump, igualdad de catálogo, conciliación de factura,
RLS, restricciones de inmutabilidad y cleanup. Aunque pase, solo demostrará una
restauración local con datos sintéticos; no acredita un restore de Preview o
producción, ni sustituye la revisión de compatibilidad remota.
