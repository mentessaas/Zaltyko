# Checklist QA manual - Zaltyko

Fecha: 2026-07-07  
Alcance: demo y flujos criticos por rol. No sustituye pruebas automatizadas; sirve para validar una academia demo real antes de vender.

## Preparacion

- [ ] Usar entorno con build caliente o deployment estable.
- [ ] Confirmar variables Supabase, NextAuth y Stripe test sin imprimir secretos.
- [ ] Generar sesion Playwright valida: `BASE_URL=... E2E_AUTH_EMAIL=... E2E_AUTH_PASSWORD=... pnpm test:e2e:auth`.
- [ ] Confirmar que las credenciales demo autentican en Supabase Auth antes de culpar a Playwright.
- [ ] Confirmar `E2E_ACADEMY_ID` apunta a una academia demo con datos coherentes.
- [ ] Confirmar que no hay promesas fiscales: no VeriFactu, AEAT, firma fiscal ni facturacion oficial.

## Super Admin

- [ ] Login con usuario `super_admin`.
- [ ] Ver dashboard sin errores de consola.
- [ ] Ver academias y comprobar conteos contra tabla/listado.
- [ ] Ver usuarios y filtrar por rol.
- [ ] Ver planes/suscripciones si la pantalla esta completa; si no, no ensenarla en demo.
- [ ] Ver logs/configuracion si hay datos reales.
- [ ] Confirmar que metricas historicas sin fuente real aparecen como estado vacio o no se muestran.
- [ ] Confirmar que no aparecen academias inventadas en alertas de suscripcion.

## Dueno de academia

- [ ] Login como owner/admin de academia.
- [ ] Entrar a `/app/[academyId]/dashboard`.
- [ ] Crear un alumno/gimnasta con datos minimos.
- [ ] Editar un alumno/gimnasta existente.
- [ ] Crear un grupo/clase.
- [ ] Asignar alumno a grupo/clase.
- [ ] Asignar entrenador.
- [ ] Ver cuotas/cobros internos.
- [ ] Cambiar estado de pago interno: pendiente, pagado, vencido o parcial si existe.
- [ ] Ver asistencia por clase/sesion.
- [ ] Ver progreso tecnico/evaluaciones.
- [ ] Crear o revisar comunicacion/recordatorio interno.
- [ ] Confirmar que billing/cobros habla de cuotas, cobros y recibos internos, no de fiscalidad oficial.

## Entrenador

- [ ] Login como coach con membership de academia.
- [ ] Ver solo los grupos/clases esperados segun asignacion.
- [ ] Ver alumnas/alumnos asignados.
- [ ] Registrar asistencia en una clase asignada.
- [ ] Intentar registrar asistencia en una clase no asignada; debe bloquearse si esa es la politica de producto.
- [ ] Registrar progreso tecnico.
- [ ] Confirmar que no ve datos de otra academia.

## Padre/Familia

- [ ] Login como parent/family con vinculo real a atleta.
- [ ] Entrar al panel permitido o dashboard familiar.
- [ ] Ver solo informacion de su hija/hijo.
- [ ] Ver cuotas/pagos internos asociados.
- [ ] Ver comunicaciones permitidas.
- [ ] Ver progreso tecnico permitido.
- [ ] Intentar abrir URL de otro atleta o academia; debe bloquearse/redirigir.
- [ ] Confirmar que no accede a administracion, settings, usuarios ni datos de otros alumnos.

## Validacion tecnica ejecutada

| Comando | Resultado 2026-07-07 | Observaciones |
| --- | --- | --- |
| `pnpm exec tsc --noEmit --pretty false` | PASS | Sin errores TypeScript. |
| `pnpm lint` | PASS | ESLint sin errores. |
| `pnpm exec vitest run` | PASS | 40 archivos, 358 tests. Persisten warnings de tests UI preexistentes sobre `act()` y controlled/uncontrolled input. |
| `pnpm build` | PASS | Next build completo; 201 paginas generadas durante static generation. |
| `pnpm test:e2e:auth` equivalente con `.env.local` | FAIL | Supabase Auth devuelve `Invalid login credentials`; no se pudo regenerar `.auth/user.json` con las credenciales actuales. |
| `pnpm exec playwright test tests/e2e-role-smoke.spec.ts --project=chromium` | PASS/SKIP | Spec nuevo ejecuta y salta 3 tests porque faltan storage states por rol. |
| Dev-session manual con `NEXT_PUBLIC_ENABLE_DEV_SESSION=true pnpm dev` + cookie de `/api/dev/session` | PASS | `/dashboard`, `/athletes`, `/groups`, `/classes`, `/billing`, `/settings`, `/my-dashboard` respondieron 200 sin marcadores de error visibles. |

## Notas de hardening ejecutado

- Coach: `/api/attendance` y `/api/assessments` validan clase/atleta asignado antes de permitir asistencia o progreso.
- Familia: `/api/family/children` centraliza scoping por rol familiar, tenant y atleta permitido.
- Demo: dev-session prepara datos coherentes de Espana para academia, gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso.
