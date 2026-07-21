# Flujos críticos

## 1. Onboarding de academia

**Happy path:** registro owner → callback Supabase → perfil → academia/tenant/membership owner → sport config → checklist → dashboard. **Errores:** email no verificado, perfil incompleto, academia sin tenant, límites de plan, config deportiva inválida. **Frontera:** creación inicial es una excepción controlada a tenant; después ownership y tenant deben quedar fijados en servidor.

## 2. Invitación y vínculos familiares

**Happy path:** owner crea invitación → token de un solo uso → usuario acepta → membership o vínculo guardian-athlete → portal limitado. **Errores:** token expirado/usado, email distinto, academia eliminada, vínculo duplicado. **Frontera:** nunca aceptar `academyId`, atleta o rol del cliente sin resolverlos desde la invitación y verificar ownership.

## 3. Gestión de gimnastas

**Happy path:** staff con permiso crea/edita atleta, contactos y grupo en transacción; filtros por `tenantId` y `academyId`; valida sport config y límites. **Errores:** DOB/config/grupo inválido, plan agotado, conflicto. **Frontera:** `withTenant` + capability + academia del tenant + relación de recurso. Actualmente AUTH-001 permite omitir capability a roles baseline.

## 4. Clases → asistencia → evaluación

**Happy path:** owner crea grupo/clase, asigna coach, genera sesión; coach asignado pasa lista y registra progreso. **Errores:** sesión inexistente/cerrada, coach no asignado, doble asistencia, atleta no enrolado. **Frontera:** tenant/academy más asignación de coach; los tests previos cubren parte, pero la matriz API baseline debe repetirse.

## 5. Comunicación interna

**Happy path:** participante autorizado crea conversación/aviso, selecciona audiencia de academia, persiste mensaje y genera notificación/push. **Errores:** destinatario ajeno, template inválido, push/email no configurado. **Frontera:** pertenencia y audiencia real; evitar que un `viewer` enumere todo el directorio del tenant por RLS.

## 6. Cobros y Stripe Connect

**Happy path:** owner conecta cuenta Standard → familia guarda método en la cuenta conectada → cargo/attempt → webhook firmado reconcilia → recibo/reembolso. **Errores:** Connect incompleto, SCA, rechazo, webhook duplicado/fuera de orden, secreto ausente, refund parcial. **Frontera:** cuenta Stripe debe corresponder a academia/tenant; familia solo paga sus cargos; cron y webhooks usan identidad externa verificable e idempotencia.

## 7. Portal familiar/atleta

**Happy path:** parent/athlete inicia sesión → shell limited → hijos/propio, agenda, progreso, mensajes y cargos permitidos. **Errores:** vínculo revocado, hijo de otra academia, perfil sin membership. **Frontera:** vínculo guardian/self y academia en cada query; no basta tenant-wide RLS.

## 8. Super-admin

**Happy path:** sesión Supabase con claim verificado → middleware y API confirman `super_admin` → operación global auditada. **Errores:** JWT expirado, secret ausente, claim inválido, login deshabilitado. **Frontera:** verificación criptográfica/remota y revalidación en handler; nunca confiar en UI o `user_metadata`.

## Hallazgos

| ID | Archivo/flujo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación | Responsable |
|---|---|---|---|---|---|---|
| FLOW-001 | atletas, clases, billing y demás rutas registradas | AUTH-001 rompe la frontera capability para membership baseline. | Crítica | Acciones core por usuario sin permiso. | Bloquear primero y ejecutar matriz negativa completa antes de reabrir release. | Sol |
| FLOW-002 | invitaciones, recovery, Stripe, cron | **Parcial Día 4:** pruebas locales cubren expiración/replay de invitaciones, idempotencia y aislamiento de cuenta Connect, refunds acumulados y exclusión concurrente de cron. No se repitió el E2E externo de SCA/rechazo/webhook ni Playwright. | Media | Integraciones pueden fallar por configuración o proveedor pese al contrato local. | Repetir en Stripe test mode y con identidades aisladas; verificar entrega real de webhook/email y revocación. | Terra |
| FLOW-003 | Stripe/cron/email; `src/lib/env.ts` | **Mitigado en código Día 4:** readiness tipado por feature, email y rate limit fallan cerrados en producción, y `.env.example` documenta variables activas. La paridad real de Vercel no fue consultada. | Alta | Un despliegue externo incompleto sigue pudiendo bloquear la feature. | Convertir readiness en gate de deploy y comparar solo nombres/metadatos de Preview/Production. | Sol |
| FLOW-004 | portal familiar + RLS tenant-wide | La frontera familiar no está garantizada por las policies generales. | Crítica | Exposición de datos de otros menores del mismo tenant. | Policies y queries por vínculo guardian/self; revocar acceso Data API no requerido. | Sol |

## Cierre local Día 4

- Stripe Connect rechaza eventos cuyo `account`, metadata, importe o moneda no coinciden con el ledger; la firma usa cuerpo raw y tolerancia explícita de 300 segundos.
- Reembolsos se serializan con advisory lock, limitan el acumulado pendiente y reutilizan una clave idempotente estable; el método de pago familiar solo se guarda si pertenece al Customer canónico de esa familia y cuenta conectada.
- Invitaciones y link requests reclaman el token/solicitud atómicamente antes de crear membresías; URLs de invitación usan el origen configurado, no el header `Origin` del cliente.
- Todos los cron auditados tienen lease de job. `scheduled-notifications` expone el `GET` que invoca Vercel y ya no marca como enviado un destinatario cuyo canal falló.
- El alcance fue exclusivamente local y simulado: sin cargos, cambios de webhooks, SQL, usuarios, datos o despliegues reales.

## Gate final antes de Día 5 — 2026-07-18

- `pnpm verify:production`: PASS con 293 Route Handlers auditados, RLS 69/69, migraciones 6 Drizzle + 40 Supabase, TypeScript/ESLint, 90 archivos y 640/640 tests, y build de 219 páginas.
- El alias `/app/[academyId]/evaluations` tiene prueba separada del smoke de módulos. Exige URL final `/app/[academyId]/assessments`, `#main-content` visible y ausencia de errores; pasa Chromium, Firefox y WebKit, 3/3 con `--retries=0`.
- La misma ruta bajo `next start` queda bloqueada con 429 antes del redirect cuando falta Vercel KV. Es el comportamiento fail-closed esperado y se mantiene como bloqueo externo de producción; en `next dev` la suite autenticada Chromium pudo recorrer 12/13 pruebas.
- Stripe test mode respondió 200 para cuenta y precios; el único webhook Connect apunta a `https://zaltyko.com/api/stripe/connect/webhook`. Se creó un PaymentIntent de prueba SCA (`requires_action`) y se canceló sin cargo. El secreto Connect fue rotado con 2FA y guardado en Vercel Production; queda observar la entrega firmada end-to-end después de que el redeploy `CugHPvZEr` figure Ready.
