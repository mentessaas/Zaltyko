# Runbook — E2E SCA/3DS live (ZAL-10 / ZAL-410)

Recorrido real del reto 3D Secure con la tarjeta `4000 0027 6000 3184`, en los
dos puntos de entrada del criterio de aceptación de ZAL-10: dashboard del owner
y portal de familia.

Suite: `tests/e2e-zaltyko-sca-3ds-flow.spec.ts`.

## Por qué hace falta este recorrido

Los unit tests de ZAL-410 fijan el contrato (que el 409 lleva `paymentMethodId`,
que el sondeo de status existe), pero **no ejercitan `confirmCardPayment` contra
Stripe**. QA-ZAL-408 cerró FAIL con 50/50 verde: el reto no se abría y ningún
test lo veía. Esta suite es la que sí lo ve, porque abre el reto de verdad.

`tok_visa` (4242) no sirve para esto: nunca dispara SCA. La tarjeta
`4000 0027 6000 3184` (token `tok_threeDSecureRequired`) exige autenticación en
**todas** las transacciones, también off-session, que es la secuencia que
rompía.

## Prerrequisitos

1. **Academia E2E aislada** (no operativa) con Stripe Connect Standard y
   `charges_enabled=true`. Su uuid va en `E2E_ACADEMY_ID`.

   > Bloqueante conocido a 2026-08-07: no existe todavía. La única academia con
   > `charges_enabled=true` es *Aurora Elite Demo*, que vive en el Supabase de
   > **producción** y cuya familia fixture tiene guardada `4242…4242`. Aprovisionar
   > la academia aislada es el paso que falta para poder correr esto.

2. Claves de **test mode** en `.env.local`, del mismo proyecto Stripe:
   `STRIPE_SECRET_KEY=sk_test_*` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_*`.

3. Webhook Connect reenviando a local:

   ```bash
   stripe listen --forward-to http://127.0.0.1:3000/api/stripe/connect/webhook
   ```

   con `STRIPE_CONNECT_WEBHOOK_SECRET` sincronizado. **Sin esto el reto pasa pero
   el cargo no llega a `paid`**: `payment_intent.succeeded` es el único camino a
   `paid` (no hay sync-on-read). La suite lo distingue y lo reporta.

## Aprovisionamiento

```bash
export E2E_ALLOW_PROVISIONING=true
export E2E_ACADEMY_ID=<uuid-academia-aislada>

# owner / coach / super-admin
pnpm tsx scripts/prepare-e2e-auth.ts
# parent + athlete (el pagador del recorrido familia)
pnpm tsx scripts/prepare-e2e-family-auth.ts
# storage states -> .auth/*.json
pnpm test:e2e:auth --project=chromium

# un cargo pending por cada recorrido (owner y familia consumen uno cada uno)
E2E_CHARGE_LABEL="E2E SCA owner"   pnpm tsx scripts/seed-e2e-charge.ts   # -> chargeId=...
E2E_CHARGE_LABEL="E2E SCA familia" pnpm tsx scripts/seed-e2e-charge.ts   # -> chargeId=...
```

`seed-e2e-charge.ts` es idempotente por `(academia, athlete, period, label)`: en
reruns resetea el cargo a `pending` sin duplicar filas ni reutilizar claves
idempotentes de Stripe.

## Ejecución

```bash
pnpm dev   # en otra terminal

E2E_SCA_3DS_FLOW=1 \
E2E_ACADEMY_ID=<uuid> \
E2E_OWNER_STORAGE_STATE=.auth/owner.json \
E2E_FAMILY_STORAGE_STATE=.auth/family.json \
E2E_SCA_OWNER_CHARGE_ID=<chargeId-1> \
E2E_SCA_FAMILY_CHARGE_ID=<chargeId-2> \
pnpm exec playwright test tests/e2e-zaltyko-sca-3ds-flow.spec.ts --project=chromium
```

Los cuatro tests corren en **serie** y en este orden (el primero deja la tarjeta
3DS guardada, que los otros tres necesitan):

| # | Qué prueba | Falla si |
|---|---|---|
| 1 | Alta de tarjeta 3DS: SetupIntent → reto → `succeeded` → `last4 = 3184` | El reto no se abre en el alta, o la familia queda con 4242 |
| 2 | `POST /api/charges/[id]/collect` → 409 `REQUIRES_ACTION` con `details.paymentMethodId` | Vuelve el bug 1 de ZAL-408 (sin PM el reto nunca abre) |
| 3 | Owner: botón *Cobrar* → reto → toast → cargo `paid` | El reto no abre desde el dashboard, o el webhook no reconcilia |
| 4 | Familia: *Pagar ahora* → reto → cargo `paid` | Ídem desde el portal de familia |

## Garantías de la suite

- **Sin `E2E_SCA_3DS_FLOW=1` los 4 tests hacen skip limpio.** No corre en CI por
  defecto ni rompe el gate. Verificado: `4 skipped`.
- **Con opt-in y sin entorno real, rompe en rojo — no pasa en silencio.**
  Verificado contra un `BASE_URL` muerto: `1 failed, 7 skipped`. Es la propiedad
  que faltaba en ZAL-408.
- Dentro del bloque live no se salta por falta de cargo: el `expect` lleva el
  comando de seed en el mensaje.

## Nota sobre el reto en iframes

Stripe renderiza el reto en iframes cross-origin anidados
(`__privateStripeFrame` → `challengeFrame` → `acsFrame`) y cambia esa jerarquía
sin avisar. `completeThreeDsChallenge()` no la fija: recorre `page.frames()`
(recursivo, incluye cross-origin) y pulsa el primer frame que exponga
`#test-source-authorize-3ds` o un botón "Complete authentication". Si Stripe
re-anida, la suite sigue funcionando.

Para probar el camino de fallo de autenticación:
`completeThreeDsChallenge(page, { action: "fail" })`.
