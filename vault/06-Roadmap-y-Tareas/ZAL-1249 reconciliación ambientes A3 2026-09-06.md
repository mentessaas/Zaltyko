---
status: implementado-local
issue: ZAL-1249
date: 2026-09-06
---

# ZAL-1249 — igualdad de entorno en reconciliación A3

## Resultado

Se exige que `db.environment` y `stripe.environment` sean iguales para
reconciliar una suscripción. Se conserva el bloqueo de cualquier hecho con
entorno `live`. Se añadió un negativo focal para `DB=test` y `Stripe=sandbox`
con ID, estado, plan y moneda coincidentes.

No se tocaron producción, Stripe live, secretos, variables externas, datos
reales, pricing ni migraciones remotas. El worktree conserva cambios paralelos
preexistentes sin stagear.

## Verificación local/sandbox

Evidencia literal del checkout efectivo:

```text
$ ls -la src/lib/growth/reconciliation.ts; wc -l src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8059 Sep 6 01:19 src/lib/growth/reconciliation.ts
     285 src/lib/growth/reconciliation.ts
$ ls -la tests/growth-canonical.test.ts; wc -l tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  12680 Sep 6 01:19 tests/growth-canonical.test.ts
     416 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
15
$ pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -30
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides". See https://pnpm.io/settings for the new home of each setting.

 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/growth-canonical.test.ts (15 tests) 13ms

 Test Files 1 passed (1)
      Tests 15 passed (15)
   Start at 01:20:01
   Duration 457ms (transform 108ms, setup 146ms, collect 76ms, tests 13ms, environment 0ms, prepare 64ms)
```

Prettier focal y `git diff --check` terminaron sin salida. La ejecución inicial
del comando canónico en el sandbox falló por `EPERM` al crear `_tmp_*`; la
repetición local autorizada produjo la salida literal anterior.

## Handoff

El checkout efectivo es `Zaltyko-fresh`; la ruta histórica
`/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` no existe en esta
máquina. Paperclip no estaba disponible en `127.0.0.1:3100`, por lo que el
comentario y la transición de estado quedan pendientes de persistencia en el
control plane. QA puede repetir la suite sobre el checkout efectivo.

Vault: actualizada esta nota; no cambian Pricing, Mensajes aprobados ni
Decisiones porque es un bugfix técnico sin decisión comercial.
