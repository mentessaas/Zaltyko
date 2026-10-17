# Revisión UX del Owner MVP — 2026-10-14

## Hallazgos clave

1. La navegación principal coloca **Inscripciones** antes de **Asistencia**, reflejando el flujo operativo acordado. El test focal verifica el orden de tareas móviles y conserva organización y sede en los enlaces.
2. El panel de cuotas permite crear una tarifa mensual cuando el catálogo está vacío. Envía organización, sede, nombre e importe; la moneda se deriva de la moneda por defecto de la organización. La asignación a la inscripción requiere una confirmación posterior separada.
3. El formulario valida nombre de hasta 100 caracteres e importe positivo dentro del límite PostgreSQL `int32`; el test comprueba que los valores fuera de límite no generan POST.
4. La carga fallida del catálogo se distingue del catálogo vacío y permite reintentar. La clave de idempotencia se conserva para resultados inciertos y se libera ante errores 4xx definitivos.
5. No se alteró la regla de facturación multiclase. No se hizo cargo real ni se inició un pago.

## Estados de verificación

| Paso o gate                                                               | Estado        | Evidencia y límite                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup Owner / alcance de organización y sede                              | PASS focal    | Typecheck y suites focales; el selector conserva el alcance en las rutas cubiertas. No es E2E autenticado.                                                           |
| Grupos y gimnastas                                                        | PASS focal    | `owner-groups-manager.test.tsx`; fixture/mocks locales.                                                                                                              |
| Clases                                                                    | PASS focal    | `owner-classes-manager.test.tsx`; fixture/mocks locales.                                                                                                             |
| Inscripciones                                                             | PASS focal    | `owner-enrollments-manager.test.tsx`; fixture/mocks locales.                                                                                                         |
| Asistencia                                                                | PASS focal    | `owner-attendance-manager.test.tsx`; fixture/mocks locales.                                                                                                          |
| Cuota mensual y resolución de tarifa                                      | PASS focal    | `owner-monthly-invoice-workspace.test.tsx` y `owner-monthly-invoices-manager.test.tsx`; contratos con respuestas simuladas.                                          |
| Pago manual                                                               | PASS focal    | `manual-payment-form.test.tsx` y `manual-payment-route.test.ts`; no prueba Stripe ni un cargo real.                                                                  |
| Navegación Owner                                                          | PASS focal    | `owner-dashboard-navigation.test.tsx`; orden y alcance en DOM de test.                                                                                               |
| Teclado, foco y medidas de controles en navegador                         | NO VERIFICADO | No se ejecutó navegador integrado. La prueba DOM no acredita interacción real ni tamaño táctil.                                                                      |
| Responsive en 375 / 768 / 1280 px, desbordamiento y estilos Next/Tailwind | NO VERIFICADO | El harness Vite temporal se retiró: sustituía el router de Next y no reproducía con fidelidad el pipeline de estilos. No se conservan capturas engañosas.            |
| E2E Owner autenticado y flujo completo hasta dashboard                    | NO VERIFICADO | La ejecución local integrada se canceló antes de Playwright para no duplicar el stack aislado que compila QA. No había sesión autenticada disponible en esta pasada. |
| Dashboard final con datos y estado real                                   | NO VERIFICADO | Sin sesión ni datos reales no se comprobó el resultado integrado.                                                                                                    |

## Fuente, alcance y siguiente paso

Fuente: rama local `codex/mvp-monthly-billing-frontend-20261013`, fixtures sintéticas y respuestas mock; ninguna evidencia de producción.

Accionable: sí. La validación pendiente es el E2E autenticado y responsive que coordina QA, usando su stack y los gates de acceso configurados. Este informe no actualiza Home/Status/Backlog/Decisions/Changelog del vault: el Tech Lead indicó que esos archivos compartidos son de su responsabilidad.

## Comprobaciones locales

- Vitest focal: 9 suites, 41 tests PASS.
- `pnpm typecheck`: PASS.
- ESLint focal: PASS, sin warnings de ESLint.
- Prettier focal: PASS.
- `git diff --check`: PASS.

Las advertencias emitidas por pnpm indican que `pnpm.overrides` en `package.json` ya no se lee desde ese campo; no causaron fallos en estas comprobaciones.
