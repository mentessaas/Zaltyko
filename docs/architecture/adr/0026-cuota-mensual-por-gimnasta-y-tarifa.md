# ADR-0026 — Cuota mensual por gimnasta y tarifa

- Estado: aceptada; emisión manual implementada localmente, E2E autenticado
  pendiente.
- Fecha: 2026-10-14.
- Contexto: decisión explícita del propietario sobre la regla de primera cuota.
- Relacionados: ADR-0002, ADR-0003, ADR-0004, ADR-0020, ADR-0025.

## Contexto

Una academia recién creada necesita emitir una primera cuota comprensible y
repetible. La regla debe corresponder a su tarifa real por gimnasta, permitir que
varias gimnastas de una familia compartan factura y no convertir una inscripción
en un pago implícito. El ledger debe conservar importe, periodo, pagador y
trazabilidad sin confiar en cálculos del navegador.

## Decisión

1. Se emite una factura por familia, sede y periodo mensual, con una línea por
   cada inscripción elegible de una gimnasta. El importe de cada línea se toma
   de su única asignación de tarifa mensual efectiva y versionada para el mes.
2. Solo una inscripción `active`, vigente del primer al último día del mes, con
   relación familiar única y vigente todo el mes, y tarifa mensual positiva de
   una sola moneda puede formar una línea. No se prorratea. Pendientes, periodos
   parciales, relaciones ambiguas, falta/solapamiento de tarifa, precio cero o
   mezcla de monedas bloquean la cotización con motivo explícito.
3. La persona pagadora y la fecha de vencimiento son elecciones explícitas. La
   fecha se interpreta usando la zona horaria de la sede. No se infiere el
   pagador ni se elige automáticamente una tarifa.
4. El servidor calcula el conjunto completo de líneas, total y moneda. El
   cliente no puede enviar importes ni seleccionar líneas parciales; solo
   devuelve la huella SHA-256 de la cotización visible. Emisión revalida la
   huella bajo bloqueo de familia/inscripciones y responde conflicto si los
   datos cambiaron.
5. Se permite una única factura vigente por familia+sede+periodo. Una factura
   anulada no se reemite de forma implícita. La idempotencia se valida contra el
   payload completo; factura, líneas, cargo pendiente, auditoría y outbox se
   escriben en una transacción.
6. La emisión v1 crea una obligación con `charge.status=due` y
   `collection_mode=manual`. No crea un pago recibido, intento de proveedor,
   mandato ni cargo automático. El registro manual del dinero ya recibido es un
   comando separado.
7. RLS/grants, autorización de servidor, claves tenant-aware, scope de sede,
   rate limit y `private, no-store` son capas complementarias. La auditoría no
   copia nombres. Los tests solo usan datos sintéticos.
8. Cualquier cobro automático futuro será una etapa distinta y opcional: solo
   plan de pago efectivo, jamás Free/trial, y sujeto a ADR-0020 y sus gates de
   consentimiento, mandato, procesador, seguridad, idempotencia, conciliación y
   release. Esta ADR no activa ni autoriza el procesador.

## Consecuencias

Una familia puede recibir una sola factura legible que suma las tarifas
mensuales de sus gimnastas inscritas. El negocio puede corregir una tarifa con
efecto fechado sin reescribir facturas anteriores. La vista previa explica los
bloqueos antes de emitir y la factura permite reconstruir qué tarifa/inscripción
originó cada importe.

La v1 no cubre prorrateos, tarifas por sesiones/asistencia, descuentos,
becas, impuestos, facturación fiscal, pagos parciales automáticos ni
conciliación de proveedor. Esas decisiones requieren especificación propia; no
se resolverán con importes editables en el formulario.

## Verificación local

`GET /api/v1/owner/billing/monthly-invoices/options` y
`POST /api/v1/owner/billing/monthly-invoices/issue` aplican la regla. La UI está
en `/owner/monthly-invoices`. En el corte 2026-10-14 pasan 23 tests focales,
TypeScript y ESLint; el build local de producción terminó. El harness de
Chromium no consiguió completar Auth, así que emisión con sesión autenticada,
aislamiento E2E, replay/conflictos de UI, sandbox, despliegue y Producción
siguen sin demostrarse.
