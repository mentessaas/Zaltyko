# ZAL-44 — Brief de aceptación: cobros Stripe Connect (ZAL-2 / ZAL-3)

> Contrato de aceptación de Producto. Define **qué evidencia** debe presentar QA/Engineering
> para que el Product Lead acepte el cierre de ZAL-2 (QA E2E de cobros Connect) y ZAL-3
> (cobertura E2E SetupIntent + cobro off-session).
>
> Este documento **no** contiene trabajo de implementación y **no** desbloquea la cascada.
> Es el checklist contra el que se mide la entrega cuando llegue.

Última actualización: **2026-08-08** · Autor: Product Lead · Issue: ZAL-44

---

## 1. Buyer y alcance

Dueño/director de academia de gimnasia artística o rítmica con cobros mensuales
recurrentes, SCA cuando aplica y reconciliación sin intervención manual.

**Entra en alcance:** guardar tarjeta, cobro off-session, recuperación SCA/3DS,
reconciliación de webhooks Connect, reembolso total y parcial, notificación de rechazo.

**Fuera de alcance:** onboarding de academias nuevas, planes anuales/Network
(sales-assisted), multi-moneda y conversión internacional, portal de atleta/parent más
allá del flujo de tarjeta.

---

## 2. Recorrido mínimo verificable por rol

### Familia
1. Guarda tarjeta (SetupIntent + `pm_card_visa`) — el `clientSecret` se propaga al
   cliente; tras confirmar, la tarjeta aparece en `/family/payment-method`.
2. SCA cuando aplique: con `4000 0027 6000 3184` el flujo responde `409 REQUIRES_ACTION`
   con `clientSecret` visible para recovery.
3. Recibe email de rechazo vía Brevo en buzón real (no solo log) tras
   `payment_intent.payment_failed`.

### Owner
4. Dispara cobro off-session: `POST /api/charges/[id]/collect` y
   `/api/cron/collect-charges` ejecutan cargo real contra la cuenta Connect de la
   academia demo.
5. Reconcilia webhook Connect: `payment_intent.succeeded` / `charge.refunded`
   idempotente, firma válida; firma inválida → `400` sin mutación.
6. Emite reembolso (total y parcial) con monto correcto y sin doble reembolso bajo
   reintento.

### Académico (coach/admin)
7. Sin acción directa en este flujo; observador del ledger de cargos y reembolsos.

---

## 3. Estados y transiciones observables

- `setup_intent.created` → `setup_intent.succeeded` → `payment_method.attached`
- `charge.requires_action` → `charge.succeeded`, o `charge.failed` con `decline_code`
- `charge.refunded` parcial o total, con receipt que refleja el importe devuelto
- Email Brevo entregado con `messageId` real en inbox de prueba (no `expect.anything()`)

---

## 4. Entorno verificable (sandbox aislado — nunca producción)

| Recurso | Valor | Estado |
|---|---|---|
| Academia demo | `E2E_ACADEMY_ID=7ea0690c-99f2-4466-8a96-f251e1235d57` | definida |
| Supabase sandbox | `aeeootdmuiqkfeernskw` (`Zaltyko E2E Sandbox`, `eu-north-1`) | secretos inyectados (ZAL-42 `done` 2026-08-07) |
| Cuenta Connect | `acct_1Tyau3Dd5HlYiTSY` (TEST) | **verificada** (ver §5) |
| Webhook local | `stripe listen --forward-to http://127.0.0.1:3000/api/stripe/connect/webhook` | requerido activo durante la corrida |

**Producción `jegxfahsvugilbthbked` queda excluida.** Cualquier corrida que la toque
se rechaza sin revisión.

---

## 5. Precondición de cuentas Connect — RESUELTA (2026-08-08)

Riesgo previo: restricción de transferencias a partir del **2026-09-18** por falta de
verificación de representante en las cuentas conectadas.

Según el memo `ZAL-356 Stripe TEST representante verificación 2026-08-08.md`
(evidencia de Platform & Security vía `stripe accounts retrieve`), ambas cuentas
—`acct_1TyapKDuB5R54ZMe` y `acct_1Tyau3Dd5HlYiTSY`— están plenamente verificadas:
`charges_enabled=true`, `payouts_enabled=true`, `capabilities.transfers=active`,
`requirements.disabled_reason=null`, `currently_due=[]`, `past_due=[]`,
`individual.verification.status=verified`.

**Implicación de producto:** las pruebas `live:` con `E2E_LIVE_STRIPE=1` no se
bloquearán por `requirements.disabled_reason`. Este brief ya no lista la verificación de
representante como riesgo abierto.

---

## 6. Política de aceptación universal (vigente desde ZAL-33 y ZAL-41)

Toda declaración de cierre debe incluir **SHA + `git show --stat` + `wc -l` / `grep -c "  it("`
focalizado + salida literal del comando de prueba**. Sin ese bloque no hay `done` ni
`in_review`.

Además debe distinguir explícitamente evidencia **local/mocks** vs **live reproducible**.
Mezclar ambas no constituye evidencia.

---

## 7. Checklist de aceptación (7 ítems — todos obligatorios)

| # | Ítem | Cómo se verifica |
|---|---|---|
| 1 | Contexto de repo | `pwd` + `git rev-parse HEAD` + `git status --short` + `git branch --show-current` + `git merge-base` contra `main` |
| 2 | Aislamiento confirmado | `STRIPE_ACCOUNT=acct_1Tyau3Dd5HlYiTSY`; academia demo aislada, no operativa |
| 3 | SHA bajo prueba | SHA + `git show --stat` + `wc -l` / `grep -c "  it("` sobre los archivos de test relevantes |
| 4 | Evidencia Stripe live | Captura o dump del dashboard Stripe TEST con cargo + evento referenciado por ID |
| 5 | Tabla de IDs | cargo, `payment_intent`, `charge.refunded`, email Brevo con `messageId` real |
| 6 | Idempotencia | Reintento del webhook demostrado: no duplica filas ni notificaciones |
| 7 | Email real | Brevo entrega en inbox de prueba tras `payment_intent.payment_failed` |

**Criterio de rechazo:** falta cualquier ítem → se devuelve con defectos numerados, no se
acepta parcialmente.

---

## 8. Riesgos que invalidan la aceptación

- Verde sin `stripe listen` activo o sin academia demo aislada.
- Brevo no entrega email real → ZAL-8 sigue bloqueado y este brief no cierra.
- Cobertura Vitest mockeada mezclada con live sin distinguir.
- Academia demo poblada con datos de la academia operativa → abortar y reaprovisionar.
- Cargo ejecutado fuera de `acct_1Tyau3Dd5HlYiTSY` o contra producción.

---

## 9. Estado de la cascada (verificado 2026-08-08T10:1xZ contra el control plane)

| Issue | Estado | Quién desbloquea / acción pendiente |
|---|---|---|
| **ZAL-42** | `done` (2026-08-07) | — secretos sandbox inyectados + Stripe CLI autenticado |
| **ZAL-356** | `done` (2026-08-08) | — cuentas Connect TEST verificadas (§5) |
| **ZAL-27** | `blocked` | **QA** debe emitir peer-verification C-2 en su propio run JWT sobre `c4e4895b3`; después Platform & Security cierra |
| **ZAL-13** | `blocked` | **Board/CEO**: autorizar a Platform & Security la inyección de secretos sandbox |
| **ZAL-8** | `blocked` | **Engineering Lead**: commit real que ejercite `sendChargePaymentFailedNotification({ failureReason: "card_declined" })` |
| **ZAL-3** | `blocked` | bloqueado por ZAL-14 (QA: suite live + unit contra Stripe test) |
| **ZAL-2** | `blocked` | 3 bloqueadores sin resolver; cierra cuando ZAL-13 / ZAL-25 / ZAL-8 caigan |

> Corrección respecto a notas previas: el propietario del desbloqueo de **ZAL-27 es QA**
> (emitir C-2 sobre `c4e4895b3`), no Platform & Security. P&S sólo ejecuta el cierre
> **después** de esa peer-verification.

### Trabajo de producto ya entregado en la línea SCA/3DS

Verificado con `git show --stat` en `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko`:

- `f83d6610b` — `feat(billing): ZAL-10 recuperacion SCA/3DS — propagar clientSecret a owner y familia` (9 archivos, +261/−58)
- `204110c94` — `fix(billing): ZAL-10 SCA 3DS — re-attach payment_method + poll status antes de refrescar` (11 archivos)
- `c4e4895b3` — `test(billing): ZAL-410 SCA 3DS — pin paymentMethodId + poll contract` (3 archivos, +208/−1)

Esto cubre el **ítem 2 del recorrido de Familia** a nivel de código. Sigue pendiente su
demostración *live* bajo los ítems 3–5 del checklist §7.

---

## 10. Compromiso del Product Lead

No abro subtareas de implementación desde este brief. Cuando ZAL-2 o ZAL-3 declaren
cierre con el checklist §7 completo y SHA reproducible, verifico y **acepto** o
**devuelvo con defectos numerados**.

---

## Relación con otros issues

- **Padre:** ZAL-2 (Cerrar QA E2E de cobros Stripe Connect)
- **Hermanos clave:** ZAL-3, ZAL-8, ZAL-10, ZAL-14
- **Subordinados Connect ya cerrados:** ZAL-49, ZAL-51, ZAL-53, ZAL-57
