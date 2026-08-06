---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../PRODUCT-ANALYSIS.md
  - ../ROADMAP.md
---
# Modulo - Evaluaciones

## Objetivo

Permitir registrar, visualizar y exportar progreso tecnico, artistico y fisico por atleta.

## Estado

Parcial. El modelo de datos y parte de las APIs existen, pero el valor visible en UI todavia necesita cierre.

## Tenemos

- Schemas de evaluaciones y puntuaciones.
- Catalogo de habilidades.
- Rubricas y tipos de evaluacion parcialmente expuestos.
- Hub principal en `/app/[academyId]/assessments`.
- Redirect legacy `/app/[academyId]/evaluations`.
- Flujo por atleta en `/app/[academyId]/athletes/[athleteId]/evaluate`, assessments, history y progress.

## Falta

- Validar que el dashboard/hub sea estable en datos reales.
- Confirmar historial comprensible por atleta con scores completos.
- Validar seguimiento por aparato/disciplina y sportConfig.
- Validar export visible y permisos tenant.

## Proximos pasos

- Ejecutar [[Tarea - Validar evaluaciones end-to-end]].
- Asegurar permisos con tenant.
- Cubrir con tests de API y smoke de UI.
