# Opciones de facturación mensual — evidencia local

- Integración local: `784c5660217c36f7f87a9f5bf5e7dd8c8e394d28`, procedente de `5ca544c5`, `03425d55` y `f0a3abb7`.
- Se sustituyen topes silenciosos por paginación ordenada y filtros en lotes. Se conservan organización, sede y periodo.
- QA revisó estáticamente producto y fixtures; se corrigieron coberturas solapadas imposibles y se añadieron aserciones sobre tarifa, pagador, cursores y bloqueo por factura existente.
- Verificación en la integración: cuatro archivos, 16 pruebas PASS, código 0, 4,44 s. Comando: `pnpm exec vitest run tests/monthly-invoice-options-pagination.test.ts tests/monthly-invoice-replay-state.test.ts tests/billing-keyset-pagination.test.ts tests/monthly-billing-paging-runner-contract.test.ts`.
- Los mocks no ejecutan joins ni SQL de PostgreSQL. Este resultado no revalida el navegador, RLS remoto, CI ni despliegue. La corrida PostgreSQL histórica de `c41dd5e7` no acredita estas nuevas consultas de opciones.
- Sigue NO-GO para publicación: quedan la paginación de métricas, la suite completa anteriormente fallida, la validación autenticada del candidato final y los gates remotos/revisión independiente. No se accedió a Sandbox ni producción.
