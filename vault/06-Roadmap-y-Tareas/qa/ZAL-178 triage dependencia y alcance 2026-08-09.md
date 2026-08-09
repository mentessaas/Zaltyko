# ZAL-178 — Triage de dependencia y alcance (2026-08-09)

**Agente:** QA (c07d53ca) · **Issue:** ZAL-178 QA — page_view consentido · **Estado al cierre del heartbeat:** `blocked`

> Esto es **triage**, no veredicto. La suite no se ejecutó. ZAL-178 es QA independiente *posterior* al veredicto de Engineering Lead, y ZAL-177 sigue `in_review`.

## 1. Corrección de dependencia

| | Antes | Ahora |
|---|---|---|
| Bloqueador declarado | ZAL-193 (**cancelada**) | ZAL-177 — Revisión Engineering Lead (`in_review`) |
| Owner del desbloqueo | — | Engineering Lead `acade097` |

El `unblockDescriptor` de ZAL-178 seguía nombrando a ZAL-193, que ya no existe como bloqueador válido. Se reescribió apuntando a ZAL-177.

Nota operativa: el server rechaza con `403 Agents may only name themselves as an unblock owner` si se intenta poner a otro agente en `owner.agentId`. Se registró self como owner y se nombró a Engineering Lead dentro de `action`.

## 2. Autorización

El board confirmó ejecución local de Playwright/axe/E2E. Coincide con la autoridad delegada permanente de QA: **localhost / worktree local / sandbox / Stripe test mode**.

No habilita: producción, dominio público, datos reales. El veredicto se enunciará como **verificación local**, nunca como readiness de producción.

## 3. Hallazgo: el objetivo de QA no es alcanzable desde `main`

Ambos commits bajo revisión existen, pero **ninguno está integrado**.

```
git cat-file -t 3963ae5690a07478e753c01159040dc6586820a0  -> commit
git cat-file -t d950a92861a166e24a1af83d5664b8397307d5a2  -> commit
git merge-base --is-ancestor d950a92... main   -> NO
git merge-base --is-ancestor d950a92... HEAD   -> NO   (HEAD = zaltyko-onboarding-ZAL-137)
```

Ramas que los contienen (tips al 2026-08-09):

- `feat/zal-158-owner-consent-cut1` → `de4dcd985`
- `fix/zal-336-utm-signup-e2e` → `6d7c7f4df`
- `qa/zal-202-utm-redirect` → `15ffd8c8d`

### Riesgo concreto de falso negativo

`src/lib/consent/state.ts` **no existe** en el árbol actual. Lo único con nombre parecido es `src/lib/consent/owner-consent.ts` + `src/db/schema/owner-consent.ts`, que pertenecen al track ZAL-158 y **no son** el módulo bajo revisión.

Quien intente validar esto desde `main` va a obtener un fallo por módulo inexistente y podría reportarlo como defecto funcional. **La re-ejecución debe correr sobre un worktree pinneado al SHA canónico.**

## 4. Confirmado presente en el objetivo (sin ejecutar)

`tests/consent-gate.test.ts` existe en `d950a92` y declara exactamente la matriz que ZAL-178 exige:

```
consent \ UTM     | sin UTM  | con UTM en sessionStorage
------------------+----------+---------------------------
unset (default)   | descarta | descarta
granted           | emite    | emite + adjunta UTMs
revoked           | descarta | descarta
```

Cubre además: cambio de consent en caliente (grant post-mount re-trackea, revoke no emite nada nuevo), SSR-safe y persistencia por versión de clave. El mock de `posthog-js` está aislado, por lo que la aserción *"el evento descartado no llama a `posthog.capture`"* es observable de forma directa.

## 5. Pregunta abierta escalada a ZAL-177

El veredicto de Engineering Lead debería **nombrar cuál SHA es el canónico**. `3963ae5` y `d950a92` conviven en varias ramas y ninguna está integrada; sin esa definición, QA validaría un árbol que quizá no sea el que se integre.

## 6. Plan de ejecución al desbloquearse

1. Crear worktree pinneado al SHA canónico que defina ZAL-177.
2. Correr `tests/consent-gate.test.ts` — matriz `unset`/`granted`/`revoked` × UTM presente/ausente.
3. Verificar grant/revoke en caliente y ausencia de `posthog.capture` en el caso descartado.
4. E2E Playwright + axe: navegación con/sin consent → dashboard analytics, **contra localhost**.
5. Registrar veredicto con evidencia acotada en ZAL-178, incluso si contiene hallazgos. Los fixes corresponden al owner de la issue padre (ZAL-160).
