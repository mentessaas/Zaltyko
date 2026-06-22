---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../src/app/app/[academyId]/attendance/page.tsx
  - ../src/app/app/[academyId]/reports/attendance/page.tsx
  - ../src/app/api/attendance/route.ts
  - ../src/app/api/reports/attendance/route.ts
  - ../src/app/api/reports/attendance/export/route.ts
---
# Tarea - Validar asistencia y reportes

## Objetivo

Garantizar que la asistencia registrada en sesiones se convierte en datos utiles para operacion y reportes.

## Alcance

- Vista `/app/[academyId]/attendance`.
- Registro/upsert en `/api/attendance`.
- Reporte `/app/[academyId]/reports/attendance`.
- Export de asistencia.

## Criterios de aceptacion

- La vista muestra sesiones recientes de la academia correcta.
- Registrar presencia/ausencia/tarde/justificada actualiza o crea registros sin duplicar.
- La API rechaza atletas que no pertenecen a la clase/sesion.
- El reporte y export reflejan la asistencia registrada.
- Todo respeta tenant y sportConfig cuando aplique.

## Pruebas

- Crear clase, generar sesion, registrar asistencia, revisar reporte.
- API test para `ATHLETE_NOT_IN_CLASS` y `ATHLETE_SPORT_CONFIG_MISMATCH`.
- Smoke responsive de la tabla de asistencia.

## Resultado 2026-06-22

- Checklist QA creado en [[QA - Flujos P1]].
- Queda pendiente ejecutar E2E/autenticado con academia demo y credenciales configuradas.
