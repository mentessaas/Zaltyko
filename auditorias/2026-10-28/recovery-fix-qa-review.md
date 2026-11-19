# Dictamen QA: recuperación de pagos manuales y emisión mensual

**Fecha:** 2026-10-28

**Checkout:** `Zaltyko-main-bridge-20261025`

**Rama:** `codex/mvp-main-bridge-20261025`

**Commit revisado:** `4ebabdd76ee021aebde05349fa85f9f16e425efa` (`fix(owner): preserve financial retries across reloads and tabs`)

**Alcance:** revisión estática del cambio integrado; sin modificación de producto.

## Dictamen

No encontré un P1 en la lectura estática. Los dos flujos conservan el comando y su clave de idempotencia cuando el resultado es incierto, exigen reintento explícito y fallan cerrados si no pueden preservar el estado local.

El P2 de atribución que encontré en el commit revisado está mitigado en cambios locales de Owner: ahora informa que v1 no identifica al iniciador, pide vincularlo expresamente a la sesión actual y no envía hasta un segundo clic de reintento. Owner añadió una prueba de esa decisión. También añadí el test determinista de dos formularios. Ninguno de esos tests se ejecutó aquí; ambos resultados quedan pendientes de CI remota.

## Hallazgos

### [P2 del commit revisado — mitigado en cambios locales de Owner]

**Fuente:** `src/components/owner-dashboard/manual-payment-retry-storage.ts:49-59,519-567`; `src/components/owner-dashboard/ManualPaymentForm.tsx:302-320`; `src/app/api/v1/owner/billing/manual-payments/route.ts:117-141`; `src/modules/billing/application/ledger-service.ts:895-937,969-1037`.

En el commit revisado, el registro v1 contiene academia, cargo y clave de idempotencia, pero no actor, y la migración se ejecutaba al abrir Owner asignándolo al usuario actual. El endpoint conserva la autorización al derivar el actor de sesión, pero la auditoría de un primer envío nuevo habría atribuido el pago a esa segunda identidad.

En el diff local de Owner, la carga deja v1 intacto; una advertencia explica que se desconoce el iniciador y el botón exige vincularlo a la sesión actual. La migración no envía el pago; el usuario debe pulsar luego el reintento. La prueba añadida verifica el aviso, la conservación antes de aceptar y la emisión solo tras reintentar (`ManualPaymentForm.tsx:316-330,605-688,1037-1069`; `tests/owner-manual-payment-readonly.test.tsx:477-568`). Esto mitiga la atribución silenciosa; la identidad histórica sigue siendo irrecuperable por el formato v1.

**Siguiente paso:** incluir el cambio de Owner y su test en CI y conservar la confirmación explícita como regla de recuperación de v1.

### [P2 — ejecución pendiente] La coordinación entre formularios aún no tiene resultado de test

**Fuente:** `tests/manual-payment-cross-tab-lock.test.tsx`; `tests/owner-manual-payment-readonly.test.tsx:383-442,64-68`; `tests/manual-payment-form.test.tsx:96-100,320-374`.

La cobertura previa conservaba `localStorage` y remontaba el componente en el mismo `window`; su mock de `navigator.locks.request` ejecutaba el callback inmediatamente. El archivo nuevo introduce dos formularios que comparten almacenamiento y una cola exclusiva determinista. Comprueba que B queda esperando mientras A mantiene el POST, que B rechaza el saldo viejo tras confirmar A y que el reintento incierto mantiene cuerpo y clave. El test no se ejecutó, así que todavía no hay evidencia de PASS.

**Siguiente paso:** incluir el archivo nuevo en la corrida remota de CI y revisar su resultado antes de afirmar que la coordinación quedó verificada.

## Evidencia favorable

- La página Owner pasa el `user.id` autenticado al formulario (`src/app/owner/payments/page.tsx:100-104`); el POST vuelve a derivar el actor de sesión y valida academia, rol financiero y sede antes de registrar el pago (`route.ts:117-141`).
- La recuperación v2 conserva actor opaco, academia, cargo, cuerpo, referencia como hash y clave. El catch tras iniciar el POST conserva la intención incierta y ofrece el mismo reintento; una respuesta 201 no coincidente tampoco borra el comando (`ManualPaymentForm.tsx:703-770,813-822`). El marcado y la limpieza se verifican sobre el snapshot exacto (`ManualPaymentForm.tsx:773-805`).
- La emisión mensual persiste el comando antes del POST, mantiene clave y cuerpo, no repite automáticamente, conserva resultados ambiguos y limpia solo tras un rechazo inicial definitivo o una respuesta de éxito con `invoiceId` válido (`OwnerMonthlyInvoicesManager.tsx:364-470`). Su estado usa `sessionStorage`, adecuado para recarga en la misma pestaña; no ofrece coordinación entre pestañas.
- La emisión mensual informa explícitamente que la factura queda pendiente y que no se registra ni inicia un pago (`OwnerMonthlyInvoicesManager.tsx:453-458`).
- En el árbol de trabajo, Owner añadió la recuperación v1 explícita y su prueba. El QA solo leyó ese diff; no lo modificó ni ejecutó.
- `tests/manual-payment-cross-tab-lock.test.tsx` cubre los tres casos pedidos, pero queda sin ejecutar hasta CI.

## Verificación y límites

- Revisión estática únicamente. `git diff --check`: PASS.
- No ejecuté tests, typecheck, build, servicios locales ni CI remota en este dictamen. El test nuevo y la prueba de Owner permanecen sin resultado.
- La CI remota queda a cargo del lead sobre el SHA que vaya a integrar. Este dictamen no afirma ejecución ni resultado de CI.
