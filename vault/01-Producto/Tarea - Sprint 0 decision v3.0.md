---
status: draft
owner: producto/tech/negocio
last_reviewed: 2026-06-23
source:
  - ../03-Negocio/Pricing.md
  - ../03-Negocio/Modelo de negocio.md
  - ../06-Roadmap-y-Tareas/Decisiones.md#2026-06-23 - Modelo freemium agresivo + monetizacion diferida por comunidad
  - ../docs/marketing/zaltyko-competitors.md
  - ../../obsidian-vault/03-Projects/zaltyko/04-30-day-action-plan.md
---

# Tarea - Sprint 0 decision v3.0

## Objetivo

Implementar la decision v3.0 de pricing freemium agresivo en codigo y docs. Tras el Sprint 0, Zaltyko debe:
1. Cobrar 19 €/mes por Starter, 49 €/mes por Growth, 99 €/mes por Network (un solo precio para Espana + LATAM).
2. Ofrecer Free util hasta 30 gimnastas (vs 50 actual).
3. Permitir trial 7 dias sin tarjeta para cualquier plan.
4. Tener anti-abuso de trial (1 cada 12 meses por academia).
5. Mostrar la nueva estructura en la landing `/pricing`.
6. Tener Stripe price IDs reales (no placeholders) para Starter y Growth.

## Origen

Decision registrada en [[../06-Roadmap-y-Tareas/Decisiones]] el 2026-06-23. Plan detallado en `04-30-day-action-plan.md` del Obsidian. Pricing completo en [[../03-Negocio/Pricing]].

## Estado detectado (2026-06-23)

**Lo que OpenCode ya implemento** (decisiones 2026-06-22 aplicadas):
- `src/lib/limits.ts`: `ACADEMY_LIMITS.pro = 1` (antes null), copy de `getUpgradeInfo` actualizado a "19€/mes" y "49€/mes" con beneficios correctos.
- `src/lib/plans/catalog.ts`: Pro con "1 academia operativa", Network con "multi-sede acompanado".
- `src/app/api/billing/checkout/route.ts`: guard `STRIPE_NOT_CONFIGURED` si el price ID contiene PLACEHOLDER.
- `docs/marketing/zaltyko-pricing.md`, `zaltyko-messaging.md`, `zaltyko-buyer-personas.md`: copy actualizado a "multi-sede bajo onboarding acompanado".
- `docs/ANALISIS_ONBOARDING_PLANES.md`: limites actualizados a 1 academia, "hablar con Zaltyko para Network".

**Lo que falta para Sprint 0** (6 bloques):

### Bloque 0.1 — Limites de Free util (30 atletas)

`src/lib/limits.ts`:
- `ATHLETE_LIMITS.free`: `50` → `30`
- `GROUP_LIMITS.free`: `3` → `2`
- `CLASS_LIMITS.free`: `10` → `5`
- Verificar que estos limites se aplican correctamente en `/api/academies/[id]/athletes` (limite al crear atleta).

### Bloque 0.2 — DB `plans` con precios nuevos

Migracion SQL nueva:
```sql
-- db/migrations/00XX_realign_plan_prices_v3.sql
UPDATE plans SET athlete_limit = 30  WHERE code = 'free';
UPDATE plans SET athlete_limit = 75  WHERE code = 'starter';   -- antes 50
UPDATE plans SET athlete_limit = 200 WHERE code = 'growth';   -- antes 250
UPDATE plans SET athlete_limit = NULL WHERE code = 'network';

UPDATE plans SET price_eur = 0   WHERE code = 'free';
UPDATE plans SET price_eur = 19  WHERE code = 'starter';
UPDATE plans SET price_eur = 49  WHERE code = 'growth';
UPDATE plans SET price_eur = 99  WHERE code = 'network';
```

Verificar:
- `SELECT code, athlete_limit, price_eur FROM plans WHERE is_archived = false;`
- `pnpm stripe:sync` despues de crear los price IDs reales en Stripe.

### Bloque 0.3 — Stripe price IDs reales

**Tarea de Elvis** (no automatizable desde codigo):
1. Crear productos en Stripe dashboard (live mode):
   - Starter Monthly: 19 €/mes
   - Growth Monthly: 49 €/mes
   - Network Monthly: 99 €/mes (o custom)
2. Copiar los price IDs (`price_XXX`).
3. Anadirlos a `.env`:
   ```
   STRIPE_PRICE_STARTER_MONTHLY=price_XXX
   STRIPE_PRICE_GROWTH_MONTHLY=price_YYY
   STRIPE_PRICE_NETWORK_MONTHLY=price_ZZZ
   ```
4. Reemplazar los PLACEHOLDERs en `src/lib/plans/catalog.ts` con los IDs reales.
5. Confirmar que el guard `STRIPE_NOT_CONFIGURED` deja de saltar en `/api/billing/checkout`.

### Bloque 0.4 — Trial 7 dias sin tarjeta

**Componentes a tocar:**
1. **Migracion**: tabla `academy_trials` para trackear trials por academia.
   ```sql
   CREATE TABLE academy_trials (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     academy_id uuid NOT NULL REFERENCES academies(id),
     trial_started_at timestamptz NOT NULL DEFAULT now(),
     trial_ended_at timestamptz,
     converted_to_paid boolean DEFAULT false,
     last_trial_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_academy_trials_academy_id ON academy_trials(academy_id);
   CREATE INDEX idx_academy_trials_last_trial_at ON academy_trials(last_trial_at);
   ```
2. **Helper de elegibilidad**: `src/lib/billing/trial-eligibility.ts` exporta `isTrialEligible(academyId)` que retorna `true` si no hay trial previo o si han pasado >= 12 meses desde el ultimo.
3. **API**: `/api/billing/trial/start` POST que registra el trial en `academy_trials` sin requerir metodo de pago.
4. **UI**: en `/pricing` boton "Probar 7 dias gratis sin tarjeta" que llama a la API y marca la academia como trial activa.
5. **Cron**: `/api/cron/trial-expire` que corre cada hora y baja a Free las academias con `trial_started_at + 7 days < now()` y `trial_ended_at IS NULL`.
6. **Email**: template Brevo nuevo `trial-day-5.tsx`, `trial-day-6.tsx`, `trial-day-7.tsx` + cron `/api/cron/trial-nurturing`.

### Bloque 0.5 — Disparador de upgrade Free → Starter

Mensaje claro al owner cuando academia Free llega a 31 gimnastas O intenta activar pagos recurrentes O activa portal padres completo:

- Modal in-app: "Tu academia esta creciendo. Pasa a Starter (19 €/mes) para [feature]."
- Email automatico (Brevo): "Has alcanzado el limite del plan Free."
- CTA: "Probar Starter 7 dias gratis" (reutiliza flujo trial).

**Componentes:**
1. Limite al crear atleta en `/api/academies/[id]/athletes` retorna 402 con mensaje estructurado cuando `currentCount >= 30 && plan === 'free'`.
2. Frontend en `/app/[academyId]/athletes/new/page.tsx` muestra modal si recibe 402.
3. Template Brevo `upgrade-prompt-free.tsx` + cron semanal.

### Bloque 0.6 — Landing `/pricing` con nueva estructura

**Archivo:** `src/app/(site)/pricing.tsx`

- Banner superior: "Prueba 7 dias gratis, sin tarjeta".
- Plan Free destacado como "Empieza gratis para academias hasta 30 gimnastas".
- Plan Starter 19 €/mes con CTA claro "Empezar trial 7 dias" o "Elegir Starter" si la academia ya existe.
- Plan Growth 49 €/mes.
- Plan Network "Contactar ventas" (boton a `/contact-demo`).
- Nota al pie: "Un solo precio para Espana y LATAM. Conversion de divisa la hace tu banco."
- Annual toggle sigue como "(proximamente)" — NO activar annual en Sprint 0.

## Alcance

Incluye los 6 bloques de arriba.

No incluye:

- Annual billing real (decidido dejar como "proximamente" en v3.0).
- Add-ons / upsells premium (Linea 1 - mes 3-6).
- Marketplace B2B con PAWSGRIP (Linea 2 - mes 6-12).
- Marketplace `/descubre` (Linea 3 - ya hay [[Tarea - Marketplace Zaltyko y multi-idioma]]).
- Eventos / competiciones (Linea 4 - mes 12-18).

## Criterios de aceptacion

- `pnpm test tests/unit/plan-limits.test.ts` verde con nuevos limites (30/75/200/null).
- Academia Free puede operar con 30 gimnastas y ve mensaje de upgrade al intentar meter el 31.
- Academia nueva puede entrar a trial 7 dias sin meter tarjeta.
- Misma academia intentando segundo trial antes de 12 meses → bloqueado.
- Stripe checkout para Starter 19 € funciona end-to-end con `4242 4242 4242 4242`.
- Landing `/pricing` muestra la nueva estructura con los 4 planes + banner trial.
- `docs/marketing/zaltyko-pricing.md` supersedido con nota que apunta a `vault/03-Negocio/Pricing.md` y decision v3.0.
- No quedan PLACEHOLDERs en `src/lib/plans/catalog.ts` ni en `.env` de produccion.

## Pruebas

- `pnpm test tests/unit/plan-limits.test.ts` (actualizar tests existentes con limites 30/75/200/null).
- `pnpm test tests/e2e-zaltyko-p1-flows.spec.ts` (verificar que flujos existentes siguen OK).
- `pnpm test:e2e tests/e2e/stripe-checkout.test.ts` con `4242 4242 4242 4242` para Starter.
- Test manual: entrar como academia nueva, tomar trial, llegar a dia 7, baja a Free.
- Test manual: meter 31 gimnastas en Free, ver mensaje de upgrade.
- Test manual: misma academia intenta segundo trial antes de 12 meses → bloqueado.
- QA copy landing: 4 planes visibles + banner trial + nota "un solo precio".

## Riesgos

- Sin Stripe price IDs reales, el guard `STRIPE_NOT_CONFIGURED` bloquea cualquier checkout → Sprint 0 no termina hasta que Elvis los cree.
- Free 30 gimnastas reduce mucho el techo del free (vs 50 anterior). Academias que ya estan en free con 31-50 gimnastas quedan bloqueadas al intentar meter 31 → migracion de academias existentes puede ser necesaria.
- Trial sin tarjeta puede ser abusado por academias pequenas que renuevan cada 11 meses → mitigado con limite 1 cada 12 meses, pero el primer mes es vulnerable.
- Landing `/pricing` puede romper SEO si cambia copy radicalmente → mantener meta tags y estructura.
- `docs/marketing/zaltyko-pricing.md` supersedido sigue indexable en Google → anadir `noindex` o redirect.

## Documentacion a actualizar

- [[../03-Negocio/Pricing]] (ya actualizado).
- [[../03-Negocio/Modelo de negocio]] (ya actualizado).
- [[../06-Roadmap-y-Tareas/Decisiones]] decision v3.0 (ya registrada).
- `docs/marketing/zaltyko-pricing.md`: supersede con nota que apunta a la nueva decision.
- `docs/marketing/zaltyko-messaging.md`: actualizar copy del plan Free, Starter 19 €, Growth 49 €.
- `docs/marketing/zaltyko-buyer-personas.md`: actualizar "presupuesto sensible" a 19 € como ancla.
- `src/app/(site)/pricing.tsx`: copy y estructura nueva.
- [[Mensajes aprobados]] (cuando exista o se cree): copy de trial sin tarjeta, free util, starter 19 €.
- Obsidian: `03-Projects/zaltyko/03-pricing-monetization.md` y `04-30-day-action-plan.md` (ya actualizados).

## Siguiente paso

Discutir con Elvis antes de empezar a codear:

1. **Crear Stripe price IDs reales** para Starter 19 € y Growth 49 € (bloqueante, sin esto checkout falla).
2. **Confirmar limite Free en 30 atletas** (vs 25 / 50 que tenia la vault).
3. **Migracion de academias existentes en free con 31-50 gimnastas**: dejar como free y avisar, o forzar upgrade?
4. **Trial sin tarjeta + onboarding automatico**: si el usuario nuevo registra academia, automaticamente entra en trial 7 dias, o requiere click explicito en "Probar gratis"?

Tras estos 4 puntos, ejecutar bloques 0.1 → 0.6 en orden, con cada bloque commiteado y desplegado independientemente.

## Supersede

Esta tarea supersede a la antigua "Tarea - Pricing escalonado y plan gratis" (ver [[../03-Negocio/Tarea - Pricing escalonado y plan gratis]]). Esa tarea queda como referencia historica con los numeros iniciales; esta tarea es la implementacion concreta.
