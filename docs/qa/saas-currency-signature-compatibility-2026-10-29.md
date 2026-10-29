# Checkout EUR y clasificación de firmas — candidato 29oct2026

## Hallazgos

La compra test de entregas ofreció USD por la configuración adaptativa heredada del proveedor, aunque el catálogo y el procesador SaaS exigen EUR. Con verificador SaaS activo y sin secreto legacy, las firmas inválidas caían en WEBHOOK_NOT_CONFIGURED500 en lugar de rechazo400.

## Cambio

Nuevas operaciones Checkout normales usan hash de petición versión3 y adaptive_pricing.enabled=false. No cambia precio, impuestos, catálogo ni ajuste global de Stripe. Las operaciones persistidas versión2 se reconocen y reenvían sin añadir campos a su cuerpo; las versión3 conservan el campo y la misma clave en todos los reintentos. El sobre QA del ensayo mantiene hash, clave, fechas y cuerpo anteriores. No se consulta ni modifica el ensayo remoto.

Si no hay secreto legacy pero existe verificador SaaS, una petición no autorizada por éste recibe400/SIGNATURE_VERIFICATION_FAILED sin procesador ni escritura. Sin ningún verificador se mantiene500; firma SaaS válida con configuración de negocio ausente conserva503. La verificación legacy independiente y el rechazo de marca SaaS autorizada únicamente con firma legacy se conservan.

## Fuente

src/modules/saas-billing/application/saas-billing-service.ts; src/lib/stripe/webhook-handler.ts; regresiones saas-checkout-service, saas-short-paid-checkout-service y stripe-saas-webhook-dispatch. API oficial consultada con stripe docs: https://docs.stripe.com/api/checkout/sessions/create?query=adaptive_pricing indica que enabled hereda el ajuste del dashboard si se omite.

## Importancia

El versionado es necesario para no romper la recuperación de una respuesta perdida con Stripe: una clave existente no admite un cuerpo distinto. Las sesiones ya abiertas no se convierten a otra moneda ni se sustituyen automáticamente. La firma sigue siendo obligatoria.

## Validación y siguiente paso

Revisión estática y git diff --check, sin ejecutar tests/builds locales. CI completa y replay PostgreSQL desechable se ejecutarán remotamente sobre el SHA nuevo. Pendientes revisión externa del SHA y comprobación alojada antes de publicar. Preview de entregas continúa9ec408ec; no desplegar por push ni tocar producción. Permisos mínimos no aplicados. No equivale a cierre MVP ni Stripe Live.
