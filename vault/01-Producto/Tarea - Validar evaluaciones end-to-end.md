---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../src/app/app/[academyId]/assessments/page.tsx
  - ../src/app/app/[academyId]/evaluations/page.tsx
  - ../src/app/app/[academyId]/athletes/[athleteId]/evaluate/page.tsx
  - ../src/app/app/[academyId]/athletes/[athleteId]/assessments/page.tsx
  - ../src/app/api/assessments/route.ts
---
# Tarea - Validar evaluaciones end-to-end

## Objetivo

Confirmar que evaluaciones es un flujo real de producto y no solo pantallas/schema dispersos.

## Alcance

- `/app/[academyId]/assessments` como hub principal.
- `/app/[academyId]/evaluations` redirige al hub.
- `/app/[academyId]/athletes/[athleteId]/evaluate` crea nueva evaluacion.
- `/app/[academyId]/athletes/[athleteId]/assessments`, history y progress muestran resultados.
- APIs de assessments, rubrics, types, export y videos.

## Criterios de aceptacion

- Usuario con acceso a academia crea una evaluacion desde atleta y desde hub.
- La evaluacion queda asociada a tenant, academia, atleta, aparato/rama y coach si aplica.
- Historial/progreso reflejan la evaluacion creada.
- Export no rompe y respeta tenant.
- Labels sport-aware se mantienen.

## Pruebas

- Smoke Playwright o checklist manual con una academia demo.
- API test para crear/listar/exportar evaluacion con tenant correcto.
- Verificar que un atleta de otra academia no aparece ni puede evaluarse.

## Resultado 2026-06-22

- Checklist QA creado en [[QA - Flujos P1]].
- Queda pendiente ejecutar E2E/autenticado con academia demo y credenciales configuradas.
