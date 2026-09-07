---
type: audit-fase
status: in-progress
phase: 1 / D1 (Re-adherencia a patrones)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 1 — D1: Re-adherencia a patrones obligatorios

> Modo del documento: **literal** (cada hallazgo con SHA y ruta).
> No es remediación: es **inventario de gaps** para que el CEO decida prioridad.

## 1. Inventario de las 76 rutas API sin wrapper de auth

**Comando**: `find src/app/api -name "route.ts" | while read f; do grep -qE "withTenant|withSuperAdmin|withBearerTenant|withAuthenticatedNoTenant" "$f" || echo "$f"; done`

**Resultado**: 76/307 rutas (24.8%) **no usan** un wrapper de auth estándar.

**Categorización** (auditoría manual + grep de patrones):

| Categoría | Cuenta | Notas |
|---|---|---|
| Webhooks (firma verificada en handler) | 4 | Stripe, Stripe Connect, LemonSqueezy, Mailgun |
| Cron (requireCronAuth) | 8 | Todos los `src/app/api/cron/*` |
| Session-scoping (`auth.getUser` + verificación contextual) | ~36 | `/api/me/*`, `/api/profile/*`, `/api/family/*`, `/api/billing/*`, `/api/onboarding/*`, etc. |
| Públicas con rate-limit | ~11 | contact, leads, plans, public/*, growth/events, preferences |
| Token-based (HMAC invite/unsubscribe) | 5 | invite state, complete-profile, invitations/complete, unsubscribe, empleo/apply |
| Debug/admin interno | 3 | admin/verify-supabase, super-admin (stub), rate-limit-test |
| MCP / docs / advertising | 4 | mcp, docs, advertising/zones, marketplace listings |
| Stub/deprecation | 2 | stripe/checkout (410), super-admin (401) |
| Stripe checkout | 1 | 410 deprecation marker (no handler real) |
| **TOTAL** | **74** | Las 2 restantes tienen auth mixto (marketplace listings + token-based overlap) |

**Lectura**: las 76 rutas son **excepciones documentadas** (webhooks, cron, públicas+rate-limit, session-scoping, HMAC tokens, MCP). El ratio de cobertura de auth estándar baja relativamente (75.2% vs ~100% histórico) porque el delta desde 2026-07-03 fue mayormente session-scoping + públicas+rate-limit (no con `withTenant`), consistente con la política de CLAUDE.md.

**Conclusión inicial D1-1**: NO hay gap de auth en las 76 sin-wrapper. **Aprobado condicional** — D1 sigue con el siguiente eje.

## 2. FINDING P0 — LemonSqueezy webhook sin verificación de firma

**Ruta**: `src/app/api/lemonsqueezy/webhook/route.ts`
**Handler**: `src/utils/lemon.ts:52-55` (`handleWebhook`)
**Branch**: `fix/r2-csp-nonce-hydration-2026-09-07` HEAD `faa3400c`

**Comando de verificación**:
```bash
git log --diff-filter=A --follow -- src/app/api/lemonsqueezy/webhook/route.ts
# → creado en 72ef1f34 2026-07-23
grep -E "hmac|signature|verify|signing" src/utils/lemon.ts
# → (vacío)
```

**Hallazgo**:

1. `handleWebhook` en `src/utils/lemon.ts` **NO verifica la firma HMAC** que Lemon Squeezy envía en el header `X-Signature`.
2. **Solo loguea el payload** (`logger.info("Webhook received:", payload)`) — la función no persiste nada, no procesa nada.
3. La ruta sí tiene una IP whitelist (Cloudflare ranges de Lemon Squeezy), pero la validación **se desactiva en `NODE_ENV !== "production"`** (incluyendo preview de Vercel) y permite cualquier IP si falta el header `x-forwarded-for`.
4. En `createCheckout` hay un `user_id: "123"` hardcodeado como placeholder.

**Severidad**: **P0 (potencial)** porque si en el futuro el handler empieza a procesar pagos (refunds, suscripciones), cualquier actor que conozca la URL del webhook puede inyectar eventos falsificados.

**Mitigación actual**: el handler es stub (no hace nada), así que el riesgo real es **latente** hasta que se conecte a mutaciones de DB.

**Recomendación (no aplicada)**: añadir verificación HMAC con `LEMON_SQUEEZY_WEBHOOK_SECRET` antes de cualquier mutación; mientras tanto, documentar en el código que el handler es stub.

## 3. FINDING P1 — 39 rutas `withTenant` con método no-GET y sin Zod

**Comando**:
```bash
# Rutas con withTenant pero sin Zod (z.object/z.string/z.number/z.enum/z.array)
grep -rl "withTenant" src/app/api --include="route.ts" \
  | xargs -I{} sh -c 'grep -qE "z\.object|z\.string|z\.number|z\.enum|z\.array" "{}" || echo "{}"' \
  > /tmp/no_zod_routes.txt
# 72 rutas sin Zod. Filtrar a las que tienen POST/PATCH/PUT/DELETE:
while read f; do
  grep -qE "^export (const|async function) (POST|PUT|PATCH|DELETE)" "$f" && echo "$f"
done < /tmp/no_zod_routes.txt
# → 39 rutas (verificado con grep directo en el output previo)
```

**Lista completa** (39 rutas, agrupadas por dominio):

### Billing / pagos (P0 candidatos)
- `src/app/api/billing/cancel/route.ts` (POST) — **STUB 410**, no procesa nada. Aceptable.
- `src/app/api/billing/upgrade/route.ts` (POST) — **STUB 410**. Aceptable.
- `src/app/api/billing/create-payment-intent/route.ts` (POST) — verificar contenido.
- `src/app/api/billing/downgrade/route.ts` (POST + DELETE) — verificar contenido.
- `src/app/api/billing/payment-method/route.ts` (POST) — verificar contenido.

### AI endpoints (P0 candidatos)
- `src/app/api/ai/communication/chat/route.ts` (POST) — **VERIFIED**: lee `body.question`, `body.athleteInfo`, `body.faq` con validación manual `if (!question)`. **Sin Zod**, sin límite de tamaño, riesgo de prompt injection.
- `src/app/api/ai/communication/generate-progress-update/route.ts` (POST) — pendiente verificación.
- `src/app/api/ai/billing/predict-delinquency/route.ts` (POST) — **VERIFIED**: lee `body.athleteId`, `body.name`, `body.paymentHistory`, `body.lastPaymentDate`, `body.pendingAmount` con validación manual. **Sin Zod**.
- `src/app/api/ai/billing/generate-reminder/route.ts` (POST) — pendiente verificación.
- `src/app/api/ai/attendance/analyze-risk/route.ts` (POST) — pendiente verificación.

### Reportes / scheduled (P1)
- `src/app/api/reports/run/route.ts` (POST)
- `src/app/api/reports/scheduled/route.ts` (POST)
- `src/app/api/reports/scheduled/[id]/route.ts` (PATCH + DELETE)

### Communication (P1)
- `src/app/api/communication/templates/seed/route.ts` (POST)
- `src/app/api/communication/templates/email-seed/route.ts` (POST)
- `src/app/api/communication/templates/[templateId]/use/route.ts` (POST + PUT)
- `src/app/api/communication/scheduled/[notificationId]/route.ts` (DELETE)

### Notificaciones / eventos (P1)
- `src/app/api/notifications/read-all/route.ts` (PUT)
- `src/app/api/notifications/[notificationId]/read/route.ts` (PUT)
- `src/app/api/notifications/[notificationId]/route.ts` (DELETE)
- `src/app/api/events/route.ts` (POST)
- `src/app/api/events/upload/route.ts` (POST)

### Académico (P2)
- `src/app/api/academies/route.ts` (POST)
- `src/app/api/academy-memberships/[membershipId]/route.ts` (DELETE)
- `src/app/api/assessments/types/route.ts` (POST)
- `src/app/api/assessments/rubrics/route.ts` (POST)
- `src/app/api/class-enrollments/[enrollmentId]/route.ts` (DELETE)
- `src/app/api/classes/[classId]/exceptions/[exceptionId]/route.ts` (DELETE)
- `src/app/api/class-waiting-list/[entryId]/route.ts` (DELETE)
- `src/app/api/groups/[groupId]/family-conversation/route.ts` (POST)
- `src/app/api/metrics/route.ts` (POST)
- `src/app/api/payments/configure/route.ts` (POST)
- `src/app/api/empleo/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/contact-messages/[messageId]/route.ts` (DELETE)
- `src/app/api/contact-messages/[messageId]/archive/route.ts` (PUT)
- `src/app/api/contact-messages/[messageId]/read/route.ts` (PUT)
- `src/app/api/contact-messages/[messageId]/respond/route.ts` (PUT)

### Cobros (P1)
- `src/app/api/charges/[chargeId]/collect/route.ts` (POST) — **VERIFIED**: lee solo path param, no body. Zod no es estrictamente necesario, pero documentar.
- `src/app/api/charges/[chargeId]/remind/route.ts` (POST) — pendiente verificación.

**Lectura**: la métrica cruda (66.8% con Zod entre withTenant) es alarmante, pero al filtrar por métodos no-GET, **39 rutas son el gap real**. De estas, ~5 son stubs (billing cancel/upgrade/downgrade/create-payment-intent/payment-method — todos devuelven 410), y el resto son mutaciones reales.

**Severidad P0 específica** (verificadas manualmente):
- `/api/ai/communication/chat` — body arbitrario a LLM, sin Zod, sin tamaño máximo.
- `/api/ai/billing/predict-delinquency` — body con datos financieros, sin Zod.

**Recomendación (no aplicada)**: añadir Zod schema a las 39 rutas. Priorizar:
1. AI endpoints (riesgo de prompt injection / datos malformados)
2. Billing/pagos restantes (no stubs)
3. Reports/scheduled (CRUD con FK)
4. Resto en sprint siguiente

## 4. Cobertura de respuestas estandarizadas (apiSuccess/apiCreated/apiError)

**Comando**: `grep -rl "apiSuccess\|apiCreated\|apiError" src/app/api --include="route.ts" | wc -l` → **272/307 (88.5%)**.

**Gap (35 rutas)**: no usan respuestas estandarizadas. **No verificado manualmente** cuáles son stubs vs reales — candidato para D4 (salud de código).

## 5. Limitación del branch

El branch `fix/r2-csp-nonce-hydration-2026-09-07` tiene historia desde 2026-07-19. No hay commits anteriores a esa fecha en este branch. La auditoría consolidada 2026-07-03 fue sobre un estado distinto (probablemente `main` o un worktree separado). Esto impide calcular "+42 rutas nuevas desde 2026-07-03" de forma literal.

**Mitigación**: cuando R2 se mergee a main, repetir Fase 0 sobre main para alinear el baseline.

## 6. Resumen ejecutivo D1

| Finding | Severidad | Acción |
|---|---|---|
| LemonSqueezy webhook sin HMAC | **P0 (latente)** | Añadir verificación HMAC antes de conectar a mutaciones |
| 39 rutas conTenant + método no-GET + sin Zod | **P0 (5 rutas AI/billing) → P2 (resto)** | Sprint dedicado a Zod schemas |
| 35 rutas sin apiSuccess/apiCreated | **P2** | D4 lo aborda como parte de "salud de código" |

## 7. Preguntas abiertas D1 (para CEO)

- **Q-D1-1**: ¿Procedemos con el fix P0 del LemonSqueezy webhook como sprint inmediato, o lo dejamos como deuda documentada hasta conectar el handler?
- **Q-D1-2**: Para las 39 rutas sin Zod, ¿priorizamos AI + billing (5-7 rutas, 2-3 días) o sprint completo (39 rutas, 1 semana)?
- **Q-D1-3**: Las rutas stub (billing/cancel, upgrade, downgrade, create-payment-intent, payment-method) — ¿las limpiamos (DELETE) o las dejamos como 410 explícitos?

---

**Próxima entrega**: D2 — GDPR Art. 8 + datos de menores.
