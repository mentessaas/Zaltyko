# Diagnóstico focal de Vitest — 2026-10-14

## Procedencia y ejecución

- Suite completa: worktree detached en `3e225fc7521afa94b7ca9a69cdd38234ac3bf5cd`, padre `1dc95e22410e3af833417f106f7222e51665cfd0`.
- Comando único: `pnpm exec vitest run --reporter=dot`.
- Resultado: exit 1; 500 archivos (497 PASS, 2 FAIL, 1 omitido); 2.639 tests (2.633 PASS, 3 FAIL, 3 omitidos); 541,86 s.
- Fallos: timeout de 5 s en el primer test de `tests/api-admin-users.test.ts`; timeout de 5 s en el primer test de `tests/owner-groups-manager.test.tsx`; y fallo en el test de reintento tras reabrir la página (`owner-groups-manager.test.tsx:174`), donde el cuerpo esperado incluía `capacity: 12` y un nombre distinto del cuerpo recibido, que tenía `capacity: null` y `Iniciación`.
- Diagnóstico focal único, en el mismo checkout exacto: `pnpm exec vitest run tests/api-admin-users.test.ts tests/owner-groups-manager.test.tsx --reporter=dot`; exit 0, 2 archivos y 7/7 tests PASS en 3,98 s. Este PASS aislado no invalida el fallo de la suite completa ni demuestra flakiness.

## Revisión y límites

- `tests/api-admin-users.test.ts` usa `vi.resetModules()` antes de cada test y `vi.restoreAllMocks()` después; los `vi.doMock()` no se retiran explícitamente. La corrida focal no reproduce un fallo, por lo que no se cambió la limpieza de mocks.
- `tests/owner-groups-manager.test.tsx` ejecuta `mockFetch.mockReset()` y limpia `sessionStorage` en `beforeEach`; `afterEach` desmonta React, limpia storage y restaura globals. El cuerpo inesperado del fallo completo coincide parcialmente con los datos enviados por el test anterior, lo que es compatible con contaminación/tarea tardía, pero la causa no quedó demostrada.
- El componente persiste la clave de idempotencia en `sessionStorage`, pero reconstruye el cuerpo desde los valores actuales del formulario (`OwnerGroupsManager.tsx`, `getCreateKey` y `createGroup`). El test focal reintroduce el mismo nombre sin capacidad y pasa. El fallo de cuerpo del run completo no prueba por sí solo un defecto de payload de producción; no se cambió el comportamiento ni el invariante de idempotencia.
- La configuración Vitest incluye 486 archivos web y 14 de los 16 archivos móviles; excluye las regresiones `mobile/tests/braces-nesting-regression.test.ts` y `mobile/tests/node-forge-signature-regression.test.ts`. Había 31 dependencias del manifiesto móvil sin resolver en el árbol local. No se instalaron paquetes ni se cambiaron exclusiones.
- Warnings observados: pnpm ignora la clave `pnpm.overrides` del `package.json`; hubo warnings React `act(...)` durante `OwnerEnrollmentsManager`. No se ajustaron timeouts, reintentos, workers ni exclusiones.
- No se ejecutaron E2E, PostgreSQL, navegador, sandbox, plataformas ni producción. No se modificó código de producto ni tests; la causa exacta sigue abierta.
