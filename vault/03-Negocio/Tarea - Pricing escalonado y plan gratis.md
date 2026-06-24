---
status: superseded
owner: negocio
last_reviewed: 2026-06-23
superseded_by: ../01-Producto/Tarea - Sprint 0 decision v3.0.md
source:
  - ../docs/marketing/zaltyko-competitors.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ./Pricing.md
---

# Tarea - Pricing escalonado, free util y trial sin tarjeta

> **⚠️ SUPERSEDED 2026-06-23** — Esta tarea queda como referencia historica con la discusion inicial de numeros. La implementacion concreta esta en [[../01-Producto/Tarea - Sprint 0 decision v3.0]].
>
> Los numeros finales validados son: Free 30 atletas, Starter 19 €/mes (75 atletas), Growth 49 €/mes (200 atletas), Network 99 €/mes (multi-sede), trial 7 dias sin tarjeta con anti-abuso 1 cada 12 meses, fee 0 € markup sobre Stripe directo, un solo precio para Espana + LATAM.

## Objetivo

Implementar el modelo de pricing freemium agresivo de Zaltyko con un unico precio equilibrado para todo el mercado hispano (Espana + LATAM), trial 7 dias sin tarjeta, y plan Free util hasta 30 gimnastas. La meta no es maximizar revenue por academia sino **construir la mayor comunidad de academias de gimnasia hispanohablantes del mundo** para monetizar despues por upsells, marketplace, eventos y partnerships.

## Origen

Definido en [[Pricing]] y activado como decision oficial el 2026-06-24. Las entrevistas quedan como validacion post-lanzamiento, no como bloqueo para publicar.

## Estado detectado

- [[Pricing]] tiene pricing v3.0 activo.
- Catalogo tecnico actual: `free`, `pro`, `premium` (codigos internos) → Free, Starter, Growth. Network se publica como CTA comercial.
- Limites: Free 30 gimnastas, Starter 75 gimnastas/1 academia, Growth 200 gimnastas/1 academia, Network multi-sede acompanado.
- Sin fee por transaccion definido (regla provisional: ser transparente).
- Anual sigue como "proximamente" en landing (no se toca hasta cerrar esta tarea).

## Recomendacion de empaquetado (propuesta 2026-06-23)

**Un solo precio equilibrado para Espana + LATAM. Trial 7 dias sin tarjeta. Free util hasta 30 gimnastas.**

| Plan | Precio unico | Gimnastas | Sedes | Disparador de upgrade |
| --- | --- | --- | --- | --- |
| **Trial 7 dias** | 0 € (sin tarjeta) | ilimitado | 1 | Downgrade automatico a Free al dia 7. Un trial por academia cada 12 meses. |
| **Free** | 0 €/mes perpetuo | hasta 30 | 1 | >30 gimnastas O activar portal padres completo O activar pagos recurrentes. |
| **Starter** | **19 €/mes** (≈ 20 USD) | hasta 75 | 1 | >75 gimnastas O automatizaciones O reportes ejecutivos. |
| **Growth** | 49 €/mes (≈ 52 USD) | hasta 200 | 1 | >200 gimnastas O multi-sede. |
| **Network** | 99 €/mes (≈ 105 USD) | ilimitado | multi-sede | Bajo onboarding acompanado (ver [[Decisiones#2026-06-22 - V1 comercial con una academia por cliente]]). |

Fee de procesamiento: **0 € markup sobre Stripe directo**. Sin fees ocultos.

## Alcance

Incluye:

1. **Trial 7 dias sin tarjeta**: el owner entra con todas las funciones del Starter, sin pedir tarjeta. Al dia 5 email recordatorio, al dia 7 downgrade automatico a Free con email explicativo. Anti-abuso: un trial cada 12 meses por academia (track por tenant).
2. **Plan Free util**: academia con hasta 30 gimnastas, 1 sede, asistencia basica, comunicacion interna limitada (sin pagos recurrentes, portal padres completo, reportes ejecutivos, automatizaciones).
3. **Starter 19 €/mes**: pagos/cuotas recurrentes, portal padres completo, reportes basicos, progresion tecnica, comunicacion interna. Hasta 75 gimnastas.
4. **Growth 49 €/mes**: todo Starter + automatizaciones, reportes ejecutivos, add-ons premium, soporte prioritario. Hasta 200 gimnastas.
5. **Network 99 €/mes**: multi-sede acompanado, SLA dedicado, integraciones custom. Bajo onboarding (ya cerrado en Decisiones).
6. **Fee transparente**: 0 € markup sobre Stripe directo. La promesa es "pagas lo que Stripe cobra, sin sorpresas".

No incluye (decisiones separadas):

- Annual billing real (queda como "proximamente", ya documentado).
- Add-ons / upsells premium (ver [[Pricing]] Linea 1 - mes 3-6).
- Marketplace B2B de proveedores (ver [[Pricing]] Linea 2 - mes 6-12).
- Marketplace `/descubre` (ya hay [[Tarea - Marketplace Zaltyko y multi-idioma]]).

## Criterios de aceptacion

- Academia nueva puede probar todas las funciones del Starter durante 7 dias sin meter tarjeta.
- Al dia 7 sin conversion, downgrade automatico a Free sin perder datos.
- Plan Free permite academia pequena operar (gimnastas, grupos, asistencia, comunicacion basica) sin pagar y sin pedir tarjeta.
- Limite Free en 30 gimnastas dispara mensaje claro al owner cuando llega a 31.
- Starter a 19 €/mes con pricing publico en EUR (USD aproximado en landing para LATAM).
- Disparador de upgrade "portal padres completo" documentado en codigo y visible para el owner antes de bloquear.
- Fees de Stripe se muestran antes del checkout final y coinciden con lo cobrado.
- Landing `/pricing` muestra 3 planes (Free, Starter, Growth) con Network como "contactar ventas".
- No cambia DB `plans` ni Stripe placeholders sin pasar por `pnpm stripe:sync`.
- Pricing unico: el mismo precio se cobra en EUR para Espana, Mexico, Colombia, Argentina, Chile, Peru, etc. Conversion de divisa la hace el PSP/banco del cliente, no Zaltyko.

## Pruebas

- QA: academia nueva entra al trial, llega a dia 7, baja a Free automaticamente sin intervencion manual.
- QA: academia en Free llega a 31 gimnastas y ve mensaje de upgrade claro.
- QA: academias en plan Free pueden pasar a Starter desde billing sin intervencion manual.
- QA: fees de Stripe se muestran antes del checkout y coinciden con lo cobrado.
- Test e2e checkout para Starter con Stripe test (EUR y USD).
- Test anti-abuso: misma academia intenta segundo trial antes de 12 meses y se le niega.
- Revisar tabla `plans` y `src/lib/plans/catalog.ts` para coherencia con nueva definicion.

## Riesgos

- Plan Free hasta 30 gimnastas sin limites duros puede inflar DB y soporte sin conversion → monitorizar coste por academia free y tener techo (ej: 50.000 gimnastas totales free = apagar registro hasta tener monetizacion).
- Trial sin tarjeta puede ser abusado por academias pequenas que renuevan cada 11 meses → mitigado con limite de 1 trial cada 12 meses.
- Si el disparador de upgrade "portal padres completo" no genera suficiente valor percibido, las academias Free se quedan Free para siempre → validar con entrevistas.
- Si el Free crece demasiado rapido sin conversion, hay que cortar registro temporalmente.
- Pricing unico EUR/USD funciona para mercados de poder adquisitivo similar pero puede dejar fuera academias de paises con PPP muy bajo (Bolivia, Paraguay, Venezuela) → monitorizar conversion LATAM por pais.

## Documentacion a actualizar

- [[Pricing]] ya actualizado con esta recomendacion.
- [[../../docs/marketing/zaltyko-pricing]] si existe, con la nueva estructura.
- [[Mensajes aprobados]] con copy para trial sin tarjeta, free util, starter 19 €.
- `src/lib/plans/catalog.ts`, `src/lib/limits.ts` si cambian limites (Starter pasa de 50 a 75 atletas; Free se introduce como plan real con 30 atletas).
- `src/app/(site)/pricing.tsx` con la nueva estructura y explicitacion de "un solo precio para todo el mercado hispano".

## Siguiente paso

Discutir con Elvis los 4 numeros clave antes de implementar:
1. Trial sin tarjeta = OK o requiere tarjeta? (mi recomendacion: sin tarjeta).
2. Limite Free 30 gimnastas = OK o subir a 50? (mi recomendacion: 30, captura y fuerza upgrade).
3. Starter 19 €/mes = OK o ajustar a 15/25? (mi recomendacion: 19, redondo y competitivo).
4. Disparador de upgrade "portal padres completo" + "pagos recurrentes" = OK? (mi recomendacion: si, son los dos que mas valor percibido dan al ICP).

Tras esto, validar las 4 preguntas con 10 entrevistas antes de tocar codigo.
