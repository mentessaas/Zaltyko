# ADR-0022 — Cuenta conectada de cobro por academia

- Estado: aceptada para el modelo de datos; Connect y el cobro siguen sin estar
  habilitados.
- Fecha: 2026-10-13.
- Contexto: separar el cobro de las cuotas familiares de la suscripción que la
  academia paga a Zaltyko, y garantizar que una autorización familiar solo se
  use en la cuenta conectada, academia y entorno para los que se obtuvo.

## Decisiones

1. `organization_payment_provider_accounts` es el registro server-only de la
   cuenta proveedora de cobro de cada academia. La identidad es única por
   organización, procesador y entorno (`test`/`live`); la referencia `acct_…`
   no es una credencial. No se guardan claves de API, secretos ni credenciales
   financieras.
2. El modelo v1 queda explícito: Stripe Connect Accounts v2, cargo directo en
   la cuenta conectada, dashboard Stripe completo y Stripe como responsable de
   cobrar sus tarifas y de los saldos negativos de esa cuenta. Stripe indica
   que las responsabilidades de tarifas y pérdidas se fijan al añadir la
   configuración de merchant y no se pueden cambiar después; además, el
   dashboard completo requiere esas responsabilidades en Stripe. Por ello no
   son opciones intercambiables que Zaltyko pueda cambiar silenciosamente.
   El contrato comercial, las tarifas comunicadas y la disponibilidad de
   Accounts v2 para la plataforma deben confirmarse antes de crear cuentas.
3. `family_payment_authorizations` referencia una cuenta de cobro concreta con
   FK compuesta `(organization_id, payment_provider_account_id)`. La base
   impide cruzar academias. El dominio comprueba también el entorno esperado,
   modelo de API, tipo de cargo, estado de cuenta y capacidad de tarjeta; el
   valor de capacidad aceptado es exactamente `active`. Antes de liberar el
   runtime habrá que exigir frescura verificable de esa proyección (umbral
   configurado y refresco/evento autenticado); hoy no existe ese umbral.
4. `provider_setup_reference`, método de pago y evidencia de consentimiento
   son referencias opacas; no constituyen por sí solas una autorización para
   cobrar. Las tarjetas guardadas deben originarse en un flujo SetupIntent
   server-side asociado a la misma cuenta conectada, con consentimiento
   explícito, revocable y demostrable del pagador.
5. El modelo interno de facturas, cargos y ledger sigue siendo la fuente de
   verdad. Al procesar Stripe en una fase posterior, el evento firmado deberá
   conservar y validar la cuenta conectada y el entorno antes de asociarse al
   tenant y producir un efecto idempotente. Las llamadas al procesador no se
   realizarán dentro de una transacción abierta de base de datos.
6. Esta decisión no habilita cobros: la elegibilidad continúa cerrada mientras
   falte cualquier gate de plan pagado vigente, preferencia/snapshot, pagador,
   autorización y consentimiento, cuenta/capacidad, entorno y release explícito
   del runtime. Free y trial permanecen manuales.

## Consecuencias y límites

- Se creó el esquema local de la cuenta proveedora antes que el esquema de
  autorización familiar para que las FK se validen desde una base vacía.
- RLS está habilitada y forzada; no hay acceso desde `anon` ni
  `authenticated`; `service_role` no puede borrar la proyección de cuentas.
- La implementación solo aporta el contrato, persistencia y evaluación
  fail-closed. No crea cuentas Connect, no inicia onboarding, no captura
  SetupIntents/consentimientos, no recibe webhooks reales y no ejecuta pagos.
- La evaluación local aún no impone antigüedad máxima a `last_synced_at`; el
  worker no puede usarse hasta definir y probar ese gate de frescura.
- Disponibilidad de Accounts v2 y configuración de la cuenta de plataforma de
  Zaltyko: **NO VERIFICADO**. No se han leído credenciales ni llamado a Stripe.
- No se aplicaron migraciones remotas, no se modificó Stripe Test/Live, Vercel
  Production ni datos productivos.

## Fuentes oficiales

- [Configurar cuentas conectadas con Accounts v2](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [Habilitar pagos directos para negocios conectados](https://docs.stripe.com/connect/enable-payment-acceptance-guide)
- [Crear un SetupIntent](https://docs.stripe.com/api/setup_intents)
- [Crear un enlace de onboarding](https://docs.stripe.com/api/account_links/create)
