# Recuperación de reintentos de pagos manuales

**Fecha:** 2026-10-28  
**Checkout:** `Zaltyko-main-bridge-20261025`  
**Rama:** `codex/mvp-main-bridge-20261025`  
**HEAD base del ajuste QA:** `4ebabdd7`

## Cambio

La marca de reintento pasa de `sessionStorage` a `localStorage` con formato v2. Cada comando se guarda bajo un ámbito formado por un hash SHA-256 del usuario autenticado, `organizationId` y `chargeId`. El ID de usuario no se persiste. El registro conserva el cuerpo necesario para la repetición, la misma clave de idempotencia, el saldo observado al iniciar y el hash de la referencia; nunca conserva la referencia en claro ni credenciales.

`src/app/owner/payments/page.tsx` pasa el ID del usuario ya autenticado en servidor. `ManualPaymentForm.tsx` obtiene Web Locks antes de leer/migrar, reservar, enviar o limpiar un comando. Mantiene el bloqueo exclusivo durante el POST. Si el navegador no ofrece Web Locks, el almacenamiento no está disponible o la validación falla, la interfaz bloquea el envío.

El formulario no repite el comando automáticamente. La persona debe pulsar **Reintentar el mismo registro**; si había referencia, debe introducirla otra vez. El cliente comprueba bajo el bloqueo que el comando sigue guardado exactamente igual y repite el mismo cuerpo y la misma clave. Un fallo de red tras iniciar el POST conserva el comando como incierto y permite ese reintento explícito.

Al confirmar un pago se guarda una marca de saldo restante por academia y cargo antes de limpiar el comando exacto. Otras pestañas releen comandos al recuperar foco y ante eventos de almacenamiento. La marca compartida impide que una pestaña con el saldo anterior cree un comando nuevo después de que otra haya confirmado un pago; la página puede actualizarla cuando recibe datos nuevos del servidor. La limpieza verifica todos los campos del comando y nunca borra otro ámbito.

Los registros v1 aún presentes en `sessionStorage` ya no se migran al cargar la página. Como ese formato no identificaba al usuario, Owner muestra una explicación y espera una acción expresa para vincular el envío antiguo a la sesión autenticada actual. Esa acción solo migra y verifica la marca, conserva la clave original y no hace el POST. El envío ocurre únicamente con una segunda acción explícita de reintento, y los endpoints vuelven a comprobar los permisos.

## Archivos

- `src/components/owner-dashboard/manual-payment-retry-storage.ts`: formato v2, validación estricta, ámbito por actor/academia/cargo, lectura de comandos, hash de referencia, marcadores de saldo, lectura v1 sin reasignación y migración tras consentimiento bajo Web Locks.
- `src/components/owner-dashboard/ManualPaymentForm.tsx`: inicialización segura, recuperación v1 en dos acciones explícitas, relectura en foco/eventos, exclusión entre pestañas y rechazo de formularios con saldo obsoleto.
- `src/app/owner/payments/page.tsx`: entrega el ID autenticado del usuario al formulario para derivar el ámbito opaco.
- `tests/manual-payment-retry-storage.test.ts`: separación de actores y limpieza exclusiva del comando resuelto.
- `tests/owner-manual-payment-readonly.test.tsx`: persistencia tras desmontar, referencia reingresada, red incierta, saldo obsoleto, getter de almacenamiento, ausencia de Web Locks y cambio de sesión con v1 pendiente sin POST hasta ambas acciones explícitas.
- `tests/manual-payment-form.test.tsx`: adaptación de sus instancias al usuario de ámbito y al bloqueo de navegador; los casos de importe parcial esperan a que termine la comprobación de almacenamiento antes de editar un campo inicialmente deshabilitado.

## Verificación

- `git diff --check`: PASS.
- Vitest, `tsc`/typecheck, lint, build, Playwright local, CI y E2E: NO EJECUTADOS por mí, siguiendo la instrucción del Tech Lead. La mención de QA sobre ejecuciones locales no llegó acompañada de evidencia y queda NO VERIFICADA.
- El log de CI remota recibido para `4ebabdd7` reportó 6 pruebas fallidas: 2 de `manual-payment-form.test.tsx` intentaban editar el importe mientras el control seguía deshabilitado durante la comprobación inicial del almacenamiento; se ajustaron para esperar a que se habilite, manteniendo el bloqueo fail-closed. Las otras 4 fallidas corresponden a pruebas de facturas mensuales fuera de este alcance. La corrección aún no tiene una nueva ejecución de CI.
- No hubo llamadas HTTP de verificación, consultas SQL, servicios locales, cambios de proveedor, commit, push ni despliegue.

## Límites

- El bloqueo y el estado compartido cubren pestañas del mismo navegador/perfil y origen. No coordinan sesiones en otros dispositivos o perfiles; el servidor sigue siendo la autoridad para la autorización y el saldo.
- La marca v1 no contiene saldo esperado ni identidad. Una persona debe confirmar expresamente la asociación con la sesión actual; después, conserva la misma clave y el servidor vuelve a comprobar permisos. Se requiere otro clic para enviar el reintento.
- No se cambió el endpoint ni el servicio de pagos.
- Al cierre aparecieron modificaciones ajenas a esta tarea en `OwnerMonthlyInvoicesManager.tsx`, `owner-monthly-invoices-manager.test.tsx`, `monthly-invoice-retry-storage.ts`, `monthly-invoice-retry-storage.test.ts` y dos notas de la vault. Se conservaron sin edición.

## Vault

No actualizada por instrucción expresa del Tech Lead: la evidencia de esta corrección se guarda en este informe separado.
