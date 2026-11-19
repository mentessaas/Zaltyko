# Inventario finito de rutas críticas Owner/Manager por sede

**Fecha:** 2026-10-28  
**Checkout:** Zaltyko-main-bridge-20261025  
**Rama al redactar:** codex/mvp-main-bridge-20261025  
**Código fuente del inventario:** 3a45190c1dca3fdfe624a5dc39026bcff20782a7  
**HEAD del checkout al redactar:** 2e0a8a69797c8fb415b90f27842d52b8475e3faf. Según la coordinación de esta tarea, solo corrige un selector de test; el inventario de rutas se fija en 3a45190c.

## Hallazgos

### Alcance y lectura de estados

Este inventario cubre un conjunto finito de mutaciones del MVP: alta y asignación inicial de gimnastas, grupos, clases, membresías de grupo, inscripciones, asistencia, emisión mensual y registro de pagos manuales. No pretende enumerar todas las rutas del repositorio ni cubrir Coach, portal de familias, portal público, SaaS u otras funciones.

- **Alojado (SHA indicado):** interacción autenticada y evidencia de entrega sobre ese SHA, con datos sintéticos. No se traslada automáticamente a 3a45190c ni acredita producción.
- **Aislado:** contrato de código o test/CI con mocks o fixture aislada; no demuestra el comportamiento de la ruta en una sesión alojada.
- **Pendiente:** no encontré evidencia pertinente en las auditorías consultadas.

En el código 3a45190c, el ámbito Owner acepta Owner, Admin y Manager activos. El Owner con ámbito “all” puede consultar sedes de su academia; el Manager con ámbito “selected” solo obtiene las sedes asignadas y no ve el agregado de academia (src/modules/owner-dashboard/application/owner-scope.ts:25, 92-140). Las rutas y servicios operativos vuelven a comprobar el ámbito del recurso. El alta organizativa de gimnastas y su primera asignación son una excepción deliberada: requieren Owner/Admin con acceso a todas las sedes (src/app/api/v1/owner/athlete-intake/route.ts:45-59; src/app/api/v1/owner/athlete-intake/[athleteId]/assign/route.ts:80-94).

### Matriz de mutaciones núcleo

| Mutación y ruta principal | Owner (academia/sede) | Manager (sede asignada) | Límite que sigue abierto |
| --- | --- | --- | --- |
| Alta de gimnasta/familia y primera asignación: POST /api/v1/owner/athlete-intake; POST /api/v1/owner/athlete-intake/:athleteId/assign | **Alojado — 49ac5e43:** alta sintética, datos familiares/pagador y asignación a un grupo existente. No fue alta de una academia ni creación de grupo/clase. Fuente: owner-49ac-essential-journey.md. | **Aislado:** el código exige Owner/Admin con ámbito de todas las sedes; el test de ruta espera 403 para Manager (tests/owner-athlete-intake-route.test.ts:140-147). No encontré una llamada alojada al endpoint con identidad Manager. | Mantener la restricción de Owner/Admin; si se necesita evidenciarla en entrega, probar el rechazo directo sin inferirlo de la navegación. |
| Crear grupo: POST /api/v1/owner/groups | **Pendiente de positivo alojado:** el intento Owner observado en 49ac recibió 409 por límite Free de 3/3 grupos; ese resultado no prueba una autorización funcional ni un rechazo por rol. Hay tests aislados de la ruta. | **Alojado — 49ac5e43:** POST permitido 201 en su sede; POST a otra sede de la academia 403 LOCATION_SCOPE_DENIED; POST a otra academia 403. Snapshots muestran el grupo/audit/outbox esperado en A y sin escritura de negocio en B. | La prueba Manager positiva y negativa sí está acotada por sede; falta un positivo Owner en una sede con capacidad. Fuente: delivery-49ac5e43-manager-validation.md y owner-49ac-essential-journey.md. |
| Crear clase: POST /api/v1/owner/classes | **Pendiente de positivo alojado:** el intento Owner observado en 49ac recibió 409 por límite Free de 10/10 clases; no es un fallo de autorización. | **Alojado — 85dda60e:** clase creada 201 en la sede asignada; la misma operación dirigida a la sede ajena fue 403 LOCATION_SCOPE_DENIED, sin clase/sesión parcial. | Falta positivo Owner en un ámbito con capacidad. La clase creada por Manager no tenía todavía participante inscrito. Fuente: manager-85dda-fixture-permitted.md y manager-85dda-site-validation.md. |
| Añadir o mover gimnasta en grupo: POST /api/v1/owner/groups/:groupId/memberships | **Pendiente para esta ruta concreta:** el alta Owner de 49ac asignó mediante el flujo de primera asignación de athlete-intake; no tomo eso como prueba del endpoint genérico de membresías. | **Pendiente alojado:** el código y servicio incluyen Manager con comprobación de sede (src/app/api/v1/owner/groups/[groupId]/memberships/route.ts:62; src/modules/groups/application/group-membership-service.ts:105), pero no encontré un cambio de membresía realizado por Manager en las auditorías consultadas. | Fixture y autorización positiva/negativa para esta operación, sin confundirla con crear el grupo. |
| Crear/activar inscripción: POST /api/v1/owner/enrollments y transición de enrollment | **Alojado — 49ac5e43:** inscripción pendiente y activación en una clase existente. | **Aislado; positivo alojado pendiente:** las rutas/servicio admiten Manager sujeto a sede (src/app/api/v1/owner/enrollments/route.ts:54, 101; src/modules/enrollments/application/enrollment-service.ts:37). En 85dda no había participante elegible en la sede limitada; no se envió una mutación. | Preparar un participante sintético elegible en una clase de la sede asignada y comprobar también la denegación fuera de sede. Fuente: manager-85dda-enrollment-attendance-fixture-gap.md. |
| Registrar asistencia: POST /api/v1/owner/sessions/:sessionId/attendance | **Alojado — 49ac5e43:** marca sintética guardada para una inscripción existente; la sesión era futura de QA. | **Alojado — 90c4ba7e:** cambio permitido y restauración a Presente en su sede; POST equivalente a una sede fuera de alcance 403, con los snapshots de negocio idénticos. | Evidencia por esta operación y estos fixtures; no es cobertura de todas las sedes, sesiones o endpoints. Fuente: delivery-90c4-attendance-validation.md. |
| Emitir factura/cuota mensual: POST /api/v1/owner/billing/monthly-invoices/issue | **Alojado — 49ac5e43 y 71fa01d6:** emisión inicial 201; en 71fa, respuesta perdida, recarga y replay 200 con cuerpo/clave originales, una factura y un cargo. El ajuste visual de 3a45190c no está en ese deployment. | **Aislado; denegación alojada de esta API pendiente:** el contrato de ruta/servicio reserva la emisión financiera a Owner/Admin y vuelve a comprobar academia, sede y acceso financiero. Un 404 de navegación comercial no sustituye un POST Manager a este endpoint. | Verificar la respuesta directa de Manager en la entrega candidata aprobada, sin tratarla como prueba de permiso de cobros el haber ocultado la página. Fuente: delivery-71fa01d6-validation.md y código 3a45190c. |
| Registrar pago manual: POST /api/v1/owner/billing/manual-payments | **Alojado — 49ac5e43 y 71fa01d6:** pago manual; después, pago parcial de 12,50 € con respuesta perdida y replay idempotente, saldo 22,50 €, sin duplicado. En el UI del deployment 71fa el formulario mostraba por error 22,50 € como importe original; la corrección de presentación está en 3a45190c, aún no alojada. | **Aislado; denegación directa alojada pendiente:** el endpoint exige Owner/Admin; tests/owner-manual-payment-route.test.ts:171-181 espera 403 para Manager. El panel de cobros oculto no demuestra por sí solo el rechazo HTTP del endpoint. | Confirmar el rechazo directo en una entrega del código corregido; mantener separados UI, replay e integridad contable. Fuente: delivery-71fa01d6-validation.md. |

### Límites de sede y de SHA

- El Manager tiene evidencia alojada de ruta permitida y de sede denegada para grupos, clases y asistencia en los SHAs anotados. No extrapolarla a membresías o inscripciones.
- Owner A→otra academia B fue rechazado en un POST de clase; las páginas de pagos y facturas de la sede de B devolvieron 404. Esa sede pertenecía a otra academia. No prueba que Owner pueda escribir en una segunda sede de su propia academia: ese positivo no aparece en estas auditorías.
- Los intentos Owner de crear grupo/clase que devolvieron 409 fueron rechazos de capacidad, no de rol o sede.
- Ninguna validación alojada enumerada arriba corre sobre 3a45190c. El informe de pago indica que el preview seguía en 71fa01d6; 3a45190c aún esperaba CI/revisión y el rerun de 2e0a8a69 constaba pendiente. El resumen de CI de 3a incluía un fallo de selector de UI; no lo uso como sustituto de una prueba alojada ni como resultado por ruta.
- El recorrido Owner de 49ac usó grupo/clase existentes. Por tanto, no fue un recorrido completo de alta de academia y creación de todos los recursos en un solo candidato.

## Importancia

La evidencia más fuerte de Manager se concentra en grupo, clase y asistencia por sede; la inscripción y la mutación de membresías siguen abiertas. Para Owner, alta/familia, inscripción, asistencia y finanzas tienen positivos alojados históricos, pero la creación positiva de grupo/clase en una sede con capacidad y el acceso permitido a una segunda sede de la misma academia no están acreditados aquí. Los pagos y reintentos de 71fa prueban integridad del servidor de ese SHA, pero no la corrección visual añadida en 3a45190c.

Esto es un inventario de huecos observados para la próxima sesión, no una afirmación de cobertura completa del MVP, de todas las rutas ni de producción.

## Siguiente paso

En la siguiente sesión de QA, sobre un SHA candidato que haya pasado sus gates y esté efectivamente publicado en la entrega:

1. Probar un positivo Owner al crear grupo y clase con capacidad disponible, y un positivo Owner en una segunda sede de la misma academia.
2. Probar para Manager el cambio de membresía de grupo y la creación/transición de inscripción en una sede asignada; contrastar cada ruta con la misma operación fuera de sede.
3. Comprobar directamente que Manager recibe denegación en emisión mensual y pago manual, además de la navegación, y que no hay escritura parcial.
4. Mantener los rechazos de capacidad separados de las pruebas de autorización y capturar snapshots por intento para las mutaciones.

## Fuente

### Código inspeccionado en 3a45190c

- src/modules/owner-dashboard/application/owner-scope.ts:25, 92-140
- src/app/api/v1/owner/athlete-intake/route.ts:45-59
- src/app/api/v1/owner/athlete-intake/[athleteId]/assign/route.ts:80-94
- src/app/api/v1/owner/groups/route.ts:52, 98
- src/app/api/v1/owner/classes/route.ts:99
- src/app/api/v1/owner/groups/[groupId]/memberships/route.ts:62
- src/app/api/v1/owner/enrollments/route.ts:54, 101
- src/app/api/v1/owner/sessions/[sessionId]/attendance/route.ts:51, 107
- src/app/api/v1/owner/billing/monthly-invoices/issue/route.ts:35, 67
- src/app/api/v1/owner/billing/manual-payments/route.ts:46-50, 122
- Tests aislados referenciados: tests/owner-athlete-intake-route.test.ts, tests/group-management-routes.test.ts, tests/class-management-routes.test.ts, tests/enrollment-management-routes.test.ts, tests/owner-manual-payment-route.test.ts

### Auditorías del 27–28 de octubre

- ../../auditorias/2026-10-27/owner-49ac-essential-journey.md
- ../../auditorias/2026-10-27/delivery-49ac5e43-manager-validation.md
- ../../auditorias/2026-10-27/manager-85dda-fixture-permitted.md
- ../../auditorias/2026-10-27/manager-85dda-site-validation.md
- ../../auditorias/2026-10-27/manager-85dda-enrollment-attendance-fixture-gap.md
- ../../auditorias/2026-10-28/delivery-90c4-attendance-validation.md
- ../../auditorias/2026-10-28/mvp-final-candidate-status.md
- ../../auditorias/2026-10-28/delivery-71fa01d6-validation.md

No se ejecutaron pruebas, UI, API, SQL, DB ni servicios en esta sesión; la comprobación fue lectura de código y auditorías existentes. Vault y cambios ajenos se conservaron sin modificar.
