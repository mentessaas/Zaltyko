# Confirmación de pago en estado vacío

El formulario Owner conserva `Pago guardado y asignado al cargo` con semántica `role="status"` cuando un POST exitoso (201) y el refresco dejan la lista sin cargos pendientes. El estado vacío inicial sigue sin mostrar confirmación.

La ruta `POST /api/v1/owner/billing/manual-payments` responde con `apiCreated` (201) y `data` que incluye `chargeId`, `amountCents`, `method` y `receivedAt`. La interfaz consume el JSON antes de mostrar éxito o ejecutar `router.refresh()`, y verifica que esos cuatro valores coincidan con el envío. Si el cuerpo falta, no se puede leer o no coincide, conserva el mismo cuerpo y la misma clave de idempotencia para reintentar.

La regresión se cubre con el test de componente que valida el consumo del JSON antes del refresh, simula el POST exitoso y luego hace `rerender` con `charges=[]`; también verifica un 201 con datos inconsistentes y reintento idéntico. No valida backend ni navegador autenticado.

## Verificación local

- `pnpm exec vitest run tests/manual-payment-form.test.tsx --reporter=dot`: 5/5 tests aprobados.
- `pnpm typecheck`, ESLint focal, Prettier y `git diff --check`: PASS.
- E2E autenticado: no ejecutado.

Vault: no actualizada; este arreglo técnico puntual queda documentado en esta nota QA, dentro del alcance explícito de la tarea.
