# ADR-0009 — Moneda base explícita y métricas sin conversión implícita

- Estado: aceptada para implementación local
- Fecha: 2026-10-06
- Contexto: el ledger conserva importes por moneda; recomputes analíticos también
  requieren moneda y benchmark. Inferir EUR del país, mezclar importes o convertir
  automáticamente puede producir informes financieros falsos.

## Decisión

Cada organización declara `default_currency` durante bootstrap, con EUR como
valor inicial editable en el onboarding español. Se valida como código de tres
letras y se incluye en hash de idempotencia y auditoría. Esta preferencia guía
nuevos cargos; no reescribe ni convierte movimientos existentes. Toda consulta
financiera filtra por moneda y cualquier moneda adicional permanece separada.

El score solo podrá usar métricas financieras en la moneda configurada, sin FX.
El benchmark debe estar asignado explícitamente y ser único/activo para la
organización; perfiles globales, ambiguos o sintéticos no se eligen de forma
implícita. Si falta esa asignación, el worker conserva métricas y expone score
pendiente/datos insuficientes con motivo, sin bloquear operaciones.

## Consecuencias y gates

- Bootstrap solicita moneda, valor inicial EUR, con contrato Zod y constraint SQL.
- Reintentar la misma clave de bootstrap con otra moneda es conflicto de
  idempotencia.
- No se calcula FX ni se afirma que la moneda configurada represente toda la
  actividad financiera multimoneda.
- Falta implementar administración de moneda/perfil y propagación confiable al
  worker, API y UI antes de declarar la cascada completa.
- El valor EUR por defecto es una conveniencia editable, no una afirmación sobre
  moneda legal o comercial de toda academia española.

## Alternativas rechazadas

- Inferir siempre EUR desde `country_code`: países no determinan la moneda de
  facturación ni los acuerdos de una academia.
- Sumar varias monedas o aplicar una tasa no versionada: resultados engañosos.
- Escoger cualquier perfil global/activo, incluido un fixture: benchmark no
  validado y score difícil de explicar.
