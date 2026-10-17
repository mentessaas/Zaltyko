# ADR-0013: Simulación hipotética de demanda sin inferir tarifas ni benchmarks

- Estado: aceptado para V1 local
- Fecha: 2026-10-06
- Contexto: el insight `excess_demand` ofrecía una CTA de simulación sin proporcionar un flujo ejecutable ni un método calibrado de conversión/precio.

## Decisión

- La simulación usa únicamente el conteo agregado de demanda contactable del insight, una capacidad hipotética que introduce la persona usuaria y, opcionalmente, un precio mensual hipotético por plaza.
- Los escenarios 50%, 75% y 100% son sensibilidades ilustrativas sin calibración ni benchmark. La UI lo declara explícitamente; no se les denomina conversión esperada observada.
- El precio es opcional y aportado por el usuario. No se infiere de tarifas individuales de inscripciones, que pueden variar por familia, descuentos, periodicidad o historial. Si falta, se omiten importes y se muestran solo plazas/altas hipotéticas.
- La salida monetaria, si existe, es importe bruto mensual hipotético; no descuenta impuestos, costes, impagos ni descuentos.
- La acción guarda un snapshot agregado, capacidad y supuestos para su trazabilidad. No crea clases, grupos, plazas, inscripciones, cobros ni comunicaciones.
- El guardado de la simulación registra una acción humana y abre el seguimiento ya soportado; no equivale a que el grupo se haya creado ni a que los ingresos se hayan materializado.

## Consecuencias

- La decisión puede probarse antes de comprometer configuración operativa y no presenta la cifra como promesa.
- Para convertir los escenarios en predicción hacen falta muestras reales consentidas, definición de conversión (p. ej. contacto→alta) y calibración/validación por segmento; hasta entonces no se usarán como benchmark ni en Academy Health Score.
- Los importes del insight preexistente siguen siendo hipotéticos. La evaluación P0 no los hidrata desde tarifas individuales y no se debe interpretar como una tarifa representativa.

## Verificación

Pruebas de dominio cubren límite de plazas, omisión de ingresos sin precio y validación de rangos. La autorización de escritura permanece en el servicio de acciones de Insights existente (miembro humano, scope, versión, CTA e idempotencia). No se accede a servicios remotos.
