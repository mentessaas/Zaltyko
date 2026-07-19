---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../src/app/onboarding/owner/page.tsx
  - ../src/components/onboarding/OwnerOnboardingForm.tsx
  - ../src/app/api/onboarding/state/route.ts
  - ../src/app/api/onboarding/checklist/route.ts
  - Onboarding y activacion
---
# Tarea - Completar onboarding y aha moments

## Objetivo

Hacer que una academia nueva llegue a valor operativo en la primera sesion.

## Estado detectado

- `/onboarding/owner` crea la primera academia.
- Hay APIs de onboarding state, checklist, notifications, profile, owner y welcome email.
- El dashboard usa checklist y recomendaciones de setup inicial.

## Aha moments minimos

- Academia creada con disciplina/rama correcta.
- Primer grupo/clase generado o configurado.
- Primer atleta creado/importado.
- Primer cobro o asistencia registrada.
- Dashboard muestra progreso claro del setup.

## Criterios de aceptacion

- Un owner nuevo termina onboarding sin ayuda tecnica.
- El checklist refleja estado real, no pasos decorativos.
- La experiencia propone el siguiente paso correcto.
- Si hay trial, queda registrado y hay recordatorios definidos.

## Pruebas

- E2E signup/onboarding owner hasta dashboard.
- Verificar APIs `/api/onboarding/state` y `/api/onboarding/checklist`.
- QA mobile del formulario de onboarding.

## Resultado 2026-06-22

- Checklist QA creado en [[QA - Flujos P1]].
- Queda pendiente ejecutar E2E/autenticado con usuario owner nuevo o entorno demo.
