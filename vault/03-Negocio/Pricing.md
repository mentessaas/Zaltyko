---
status: active
owner: negocio
last_reviewed: 2026-11-24
source:
  - ../src/lib/plans/catalog.ts
  - ../src/modules/saas-billing/domain/saas-pricing.ts
  - ../src/modules/saas-billing/domain/spanish-vat.ts
  - ../docs/deployment/candidates/20261124121000_pricing_club_locations_candidate.sql
---
# Pricing

## Decisión vigente — 24-11-2026

Esta decisión de Elvis sustituye al empaquetado v3.0 (Free/Starter/Growth y Network) y a los importes publicados anteriormente. No crea precios en Stripe ni abre Live; la creación de los objetos Stripe queda para otro agente autorizado. No se publica precio en México y no se debe añadir una cifra en MXN.

Los importes para España peninsular y Baleares se muestran con IVA incluido. Stripe conserva el contrato actual: Prices con base neta, Tax Rate español exclusivo del 21 %, y validación de subtotal, descuento, impuesto y total. Las facturas SaaS se emiten en FacturaDirecta; no se cambia esa lógica ni se usa Stripe para emitir la factura fiscal.

| Plan | Precio | Límites y alcance |
| --- | --- | --- |
| **Gratis** | 0 € | Hasta 30 gimnastas; dos personas en el equipo contando a la dueña; grupos y clases sin límite; una sede. Gestión diaria, asistencia, cuotas manuales, niveles, diplomas, guiones de sesión y biblioteca. |
| **Club** | 29 €/mes o 290 €/año | Sin límites de gimnastas, equipo, grupos ni clases; una sede incluida. Incluye Gratis, invitaciones, titulares y sustituciones, portal familiar, avisos, recordatorios de impago, clases de prueba, importación desde Excel y resumen semanal. El cobro automático de cuotas familiares se incluye sin coste adicional cuando se active. |
| **Sede adicional** | 20 €/mes o 200 €/año por sede | Se aplica a cada `location` adicional dentro de la misma academia/organización. Una sede está incluida en Club. Stripe cobra un segundo concepto, con cantidad igual a sedes activas menos una; al añadir o desactivar sedes se actualiza con prorrateo. |

El selector mensual/anual de sedes sigue la periodicidad de Club. Dos sedes en Club mensual cuestan 49 €/mes con IVA incluido; dos sedes en Club anual cuestan 490 €/año con IVA incluido.

### Precio de fundador

Los diez primeros clubes de Málaga pueden obtener Club mensual por 24,90 €/mes con IVA incluido durante 12 meses; después se cobra el precio ordinario de 29 €/mes. Se usa un cupón/promotional code de Stripe aplicado en Checkout mensual, con duración de 12 meses y máximo 10 canjes. El cupón se configura por 3,39 € de descuento antes del IVA (4,10 € de reducción final redondeada al aplicar el 21 %). Configurar 4,10 € antes del impuesto bajaría el total a 24,04 €, por lo que no cumple el precio aprobado.

No se ofrece el precio de fundador en anual ni como plan separado. Checkout permite introducir códigos promocionales solo en Club mensual; cualquier código que supere la validación de importe queda rechazado por la aplicación.

### Prueba

Club durante 30 días, sin tarjeta, una vez por academia cada 12 meses. Termina en Gratis salvo que la dueña contrate. No se aplican cambios en Stripe ni se conceden promociones por esta nota.

### Suscripciones anteriores

Los códigos internos `pro` (antes Starter) y `premium` (antes Growth), y Network si existe, se conservan como planes heredados ocultos. Sus suscripciones, Prices, precio acordado y periodo se respetan hasta que la dueña cambie de plan. En el producto reciben los derechos de Club, pero no se les sustituye su importe por 29 €/mes ni se les migra a otro Price automáticamente. La nueva oferta pública solo contiene Gratis y Club.

## Stripe: configuración pendiente

Antes de abrir checkout, crear y revisar en cada entorno (`test` y `live`) estos cuatro Price IDs y cargarlos en variables del entorno de aplicación:

| Variable | Price requerido |
| --- | --- |
| `STRIPE_SAAS_TEST_PRICE_CLUB_MONTH` / `STRIPE_SAAS_LIVE_PRICE_CLUB_MONTH` | 23,97 EUR, recurrente mensual, Club. |
| `STRIPE_SAAS_TEST_PRICE_CLUB_YEAR` / `STRIPE_SAAS_LIVE_PRICE_CLUB_YEAR` | 239,67 EUR, recurrente anual, Club. |
| `STRIPE_SAAS_TEST_PRICE_LOCATION_MONTH` / `STRIPE_SAAS_LIVE_PRICE_LOCATION_MONTH` | 16,53 EUR, recurrente mensual, sede adicional. |
| `STRIPE_SAAS_TEST_PRICE_LOCATION_YEAR` / `STRIPE_SAAS_LIVE_PRICE_LOCATION_YEAR` | 165,29 EUR, recurrente anual, sede adicional. |

Además, conservar los Price IDs históricos en `STRIPE_SAAS_{TEST|LIVE}_PRICE_STARTER_MONTH`, `_PRICE_STARTER_YEAR`, `_PRICE_GROWTH_MONTH` y `_PRICE_GROWTH_YEAR` para que los webhooks sigan reconociendo suscripciones existentes a 19 €/190 € y 49 €/490 € (importes netos). No reemplazar ni eliminar esos IDs al cargar los nuevos Prices Club.

Crear en Stripe el cupón de importe fijo de 339 céntimos, duración `repeating`, 12 meses, `max_redemptions=10`, y un código promocional habilitado para Club mensual. El código visible debe restringirse a los diez primeros clubes de Málaga en el proceso de venta; el alcance geográfico no lo impone Stripe Checkout. No crear una variable `PRICE_*` para el cupón: se introduce como código promocional. El Tax Rate a conservar es `STRIPE_SAAS_{TEST|LIVE}_TAX_RATE_ES_IVA21`; debe existir el objeto de Stripe correspondiente al 21 % exclusivo.

No usar `pnpm stripe:sync` para los nuevos Prices sin adaptar/revisar el flujo. La configuración de Stripe y las variables son una puerta de apertura, no evidencia de que se hayan creado o probado los objetos.

## Migración candidata

`docs/deployment/candidates/20261124121000_pricing_club_locations_candidate.sql` añade límites de grupos, clases y equipo, sedes incluidas y precio de sedes adicionales a `public.plans`; conserva y archiva los planes internos antiguos, añade Club, y añade la cantidad de sedes a operaciones de checkout. Es candidata local pendiente de revisión: no aplicada en ningún entorno. La cantidad de miembros Gratis se hace cumplir contando titular, miembros e invitaciones pendientes dentro de la misma academia; no se inspecciona otra academia.

La columna `extra_location_quantity` de operaciones de checkout es metadato de facturación del SaaS. Continúa excluida de la exportación de datos operativos de academia junto al resto de referencias de cobro.

## Estado de implementación

El código local del modelo, límites, checkout, trial y sincronización de sedes queda listo para revisión y para que otro agente autorizado cree los objetos Stripe. `FacturaDirecta` permanece como emisor de facturas SaaS. No se ha llamado a Stripe, Supabase ni producción ni se ha aplicado la candidata.

Los bloques de estrategia, importes y empaquetado anteriores al 24-11-2026 son históricos y no están vigentes.
