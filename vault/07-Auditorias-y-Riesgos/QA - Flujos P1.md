---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - Tarea - Validar evaluaciones end-to-end
  - Tarea - Validar asistencia y reportes
  - Tarea - Completar onboarding y aha moments
---
# QA - Flujos P1

## Evaluaciones

- Abrir `/app/[academyId]/assessments` con un usuario de la academia.
- Confirmar que `/app/[academyId]/evaluations` redirige al hub conservando query params.
- Crear una evaluacion desde `/app/[academyId]/athletes/[athleteId]/evaluate`.
- Confirmar que aparece en assessments, progress/history del atleta y export si aplica.
- Probar que un atleta de otra academia no puede evaluarse ni listarse.
- Confirmar labels sport-aware.

## Asistencia

- Crear o elegir una clase con sesion generada.
- Abrir `/app/[academyId]/attendance` y confirmar que lista sesiones recientes.
- Registrar estados present, absent, late y excused en `/api/attendance`.
- Repetir registro y confirmar que actualiza sin duplicar.
- Probar rechazo de atleta fuera de clase: `ATHLETE_NOT_IN_CLASS`.
- Probar mismatch de modalidad si aplica: `ATHLETE_SPORT_CONFIG_MISMATCH`.
- Confirmar reporte `/app/[academyId]/reports/attendance` y export.

## Onboarding

- Crear owner nuevo y entrar a `/onboarding/owner`.
- Completar academia con disciplina/rama correcta.
- Confirmar que dashboard muestra checklist y siguiente paso.
- Crear primer grupo/clase y primer atleta/import.
- Registrar primera asistencia o primer cobro/demo.
- Confirmar que `/api/onboarding/state` y `/api/onboarding/checklist` reflejan estado real.
- Revisar mobile del formulario principal.

## Resultado actual

- Checklist documentado para ejecucion manual o E2E posterior.
- 2026-06-22: entorno E2E local configurado en `.env.local` con usuario owner de prueba, academia E2E, perfil, membresia, onboarding completado y atleta fixture. No se documentan secretos ni password.
- 2026-06-22: `pnpm test:e2e:verify-supabase` paso con anon/service key OK y login E2E OK.
- 2026-06-22: `pnpm test:e2e:auth` paso y genero `.auth/user.json` local para Playwright. `.auth/` queda ignorado por git.
- 2026-06-22: `pnpm test:e2e` autenticado paso completo: 10 passed en Chromium. Cobertura: navegacion desktop, paginas criticas, breakpoints responsive, navegacion mobile, command palette, atleta detalle, grupos/clases, billing/settings, skip link y ausencia del banner PWA en rutas autenticadas.
- 2026-06-22: se ajusto `tests/e2e-zaltyko-full.spec.ts` para tolerar latencia real de dev server: timeout mayor en flujos largos y retry puntual de navegacion ante `ERR_EMPTY_RESPONSE`, `ERR_ABORTED` o timeout inicial.
