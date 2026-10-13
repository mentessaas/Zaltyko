# ADR-0020 — Modalidad de cobro familiar y entitlement SaaS

- Estado: aceptada; preferencia y elegibilidad implementadas localmente, sin
  cobros automáticos activos.
- Fecha: 2026-10-13.
- Contexto: distinguir lo que Zaltyko cobra a una academia de lo que esta cobra
  a sus familias, y permitir elegir modalidad sin confundir preferencia con
  autorización de pago.

## Decisiones

1. `price_plans` son tarifas que una academia cobra a familias. La suscripción
   comercial de Zaltyko se proyecta en `organization_saas_subscriptions`; el
   entitlement efectivo vive en `organization_entitlements` y su historial
   append-only en `organization_entitlement_changes`. El estado organizativo
   (`trial`, `active`, etc.) no concede un plan.
2. Cada organización nueva recibe Free en la misma transacción de alta. No se
   infiere ni rellena el plan de organizaciones existentes: si falta
   entitlement, toda capacidad pagada falla cerrada.
3. `family_collection_preferences` guarda una solicitud explícita por familia,
   no por academia. Si no hay fila, la preferencia es manual. La selección
   automática requiere entitlement pagado efectivo; el contrato temporal usa
   `[effective_from, effective_until)`. La fuente Stripe exige además
   suscripción correlacionada, mismo plan, estado `active` y período proveedor
   vigente. Free, trial, past-due, desajuste o falta de correlación no permiten
   seleccionarla; no existe gracia implícita.
4. La preferencia es solo intención de la academia, no consentimiento,
   mandato, método elegible ni autoridad del pagador. Su comando deriva el actor
   de sesión/miembro, exige Owner/Admin con acceso a todas las sedes, familia
   activa con cargo abierto, control CAS por versión, idempotencia y auditoría
   más outbox transaccionales.
5. Un downgrade o cambio de entitlement incrementa su revisión. Una
   preferencia automática vinculada a la revisión anterior queda inválida y no
   se reactiva al volver a un plan pagado; la academia debe confirmarla de
   nuevo. El servicio siempre informa `effectiveMode: manual` en este corte.
6. Al emitir cargos nuevos, Zaltyko guarda `collection_mode` como snapshot de
   la solicitud familiar solo si el entitlement está vigente y la revisión
   coincide. Si no, guarda manual. Cambiar después la preferencia no altera
   cargos emitidos. Este snapshot nunca inicia un intento de pago.
7. `family_payment_authorizations` queda separado y server-only: guarda
   referencias opacas, versión y evidencia minimizada/digerible de
   consentimiento, sin tarjeta, cuenta bancaria ni identidad en bruto. No se
   trata como consentimiento operativo hasta completar su flujo de captura y
   revocación.
8. Un futuro intento automático debe volver a evaluar tenant, plan/revisión,
   preferencia, snapshot del cargo, procesador/capacidad, familia, pagador,
   autorización, consentimiento y runtime de release inmediatamente antes de
   solicitar el cobro. No se reutiliza el cron legacy.
9. Las tablas comerciales, preferencias y autorizaciones tienen RLS habilitada
   y forzada, sin grants directos a `anon`/`authenticated`; los writes son
   server-owned. El historial de entitlements no permite UPDATE/DELETE y los
   grants de servidor siguen mínimo privilegio.

## Consecuencias y límites

- La interfaz coloca la elección junto al cargo de la familia, indica que solo
  afecta cargos futuros y explica que todavía no hay cobro automático.
- La proyección de Stripe está modelada, pero no hay checkout, webhook firmado,
  sincronización de proveedor, Customer Portal, Connect ni provisioning
  comercial verificado en esta fase.
- El código local y los fixtures sintéticos no prueban sesión autenticada real,
  pagos sandbox/live, legalidad del consentimiento, despliegue ni producción.
- No se ejecutaron migraciones remotas ni se modificaron Stripe Live,
  credenciales, Vercel o datos de producción.

## Criterios de salida antes de automatizar

- Provisioning y reconciliación idempotente desde eventos firmados, Stripe Test
  aislado y verificación de cuenta/capacidades.
- Captura explícita, revocable y recuperable de mandato y consentimiento del
  pagador; revisión legal y de privacidad.
- Intento idempotente por cargo, bloqueo de carreras manual/automático, SCA,
  recuperación, conciliación y pruebas de replay/desorden/downgrade.
- Revisión de seguridad y operación; release explícito de runtime. No activar
  Stripe Live antes de autorización expresa.
