# Suscripción anual — validación de implementación

## Estado

**[VERIFICADO]** El checkout admite `month` y `year`. La variante anual usa un segundo Stripe Price del mismo plan, registra `billingInterval` en metadata y mantiene el precio mensual existente.

**[VERIFICADO]** Catálogo canónico:

| Plan | Mensual | Anual | Periodicidad |
| --- | ---: | ---: | --- |
| Starter (`pro`) | 19 € | 190 € | 12 meses, dos meses bonificados |
| Growth (`premium`) | 49 € | 490 € | 12 meses, dos meses bonificados |

**[VERIFICADO]** En Stripe test se crearon y validaron los dos precios anuales. Se generaron dos Checkout Sessions de suscripción en modo test: ambas aceptaron el precio anual, mostraron `mode=subscription`, el importe anual correcto y se expiraron sin completar ningún pago.

**[VERIFICADO]** La sandbox E2E tiene las columnas nuevas y los precios anuales asociados a `pro` y `premium`. El cambio es aditivo; no modifica suscripciones existentes.

## Cambios de código

- `plans` conserva el precio mensual y añade `stripe_annual_price_id` y `annual_price_eur`.
- `/api/billing/checkout` acepta `billingInterval` y rechaza con un error explícito la variante anual si el Price no está configurado.
- La sincronización de planes reconoce precios recurrentes mensuales y anuales.
- Facturación muestra el selector mensual/anual y refleja el período actual de una suscripción.
- Se eliminó el método de pago fijo del checkout compartido; Stripe conserva métodos dinámicos.
- Webhooks de suscripción siguen resolviendo el plan tanto por el Price mensual como por el anual.

## Pendiente para producción

**[BLOQUEADO]** Antes de desplegar el código hay que aplicar la migración aditiva en producción y crear/asociar los dos Prices anuales de producción. Esta operación requiere autorización explícita porque modifica el esquema y el catálogo de cobros productivo. No se ejecutó en producción.

**[RECOMENDACIÓN]** Después de esa autorización, ejecutar en este orden: migración `20260929120000_add_annual_plan_prices.sql`, configuración de Prices/productos, sincronización de planes, deploy y prueba Checkout anual con una cuenta y tarjeta de Stripe test.

## Fiscalidad

La facturación anual no activa automáticamente impuestos. Si se cobrarán clientes de la UE, hay que revisar el registro fiscal y configurar Stripe Tax antes de activar `automatic_tax`.
