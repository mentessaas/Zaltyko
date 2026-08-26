---
status: blocked
issue: ZAL-687
owner: Developer / agente responsable de cambios paralelos
date: 2026-08-25
---

# ZAL-687 — reintento de evidencia local

## Disposición

`blocked`, no `done`. La hidratación de los cuatro archivos locales sí está
resuelta. El cierre no puede certificarse porque el typecheck falla en un
archivo paralelo ajeno a este issue y el runner canónico no descubre la suite
focal.

No se tocaron producción, secretos, datos reales, Stripe live, migraciones
remotas ni publicaciones.

## Evidencia literal

```text
### hydration files
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5405 Aug 23 11:27 src/types/athletes.ts
     212 src/types/athletes.ts
src/types/athletes.ts flags=- size=5405
-rw-r--r--@ 1 elvisvaldesinerarte  staff  129 Aug 23 11:27 src/types/config.ts
       6 src/types/config.ts
src/types/config.ts flags=- size=129
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4595 Aug 23 11:27 src/types/event-form.ts
     131 src/types/event-form.ts
src/types/event-form.ts flags=- size=4595
-rw-r--r--@ 1 elvisvaldesinerarte  staff  783 Aug 23 11:27 src/types/onboarding.ts
      38 src/types/onboarding.ts
src/types/onboarding.ts flags=- size=783

### focal test file
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10521 Aug 23 11:29 src/lib/dashboard/attention-priority.test.ts
     338 src/lib/dashboard/attention-priority.test.ts
18
```

```text
### exact canonical vitest

 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

No test files found, exiting with code 1

filter: src/lib/dashboard/attention-priority.test.ts
include: tests/**/*.test.ts, tests/**/*.test.tsx, mobile/**/*.test.ts
exclude:  node_modules, .next, coverage

VITEST_CANONICAL_PIPE_EXIT=1

### isolated focal vitest (config bypass only to diagnose runner include)

 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ src/lib/dashboard/attention-priority.test.ts (18 tests) 41ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  09:16:39
   Duration  3.45s (transform 596ms, setup 0ms, collect 456ms, tests 41ms, environment 0ms, prepare 628ms)

VITEST_ISOLATED_PIPE_EXIT=0

### typecheck-related parallel file
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9790 Aug 25 06:56 src/lib/onboarding-owner-integration.ts
     320 src/lib/onboarding-owner-integration.ts

### canonical typecheck
src/lib/onboarding-owner-integration.ts(65,5): error TS2322: Type '{ done: boolean; }' is not assignable to type 'NextPendingResult'.
  Type '{ done: boolean; }' is missing the following properties from type '{ done: false; key: "add_5_athletes" | "create_first_group" | "setup_weekly_schedule" | "invite_first_coach" | "enable_payments" | "send_first_communication" | "login_again"; label: string; description: string; }': key, label, description
src/lib/onboarding-owner-integration.ts(82,38): error TS1355: A 'const' assertions can only be applied to references to enum members, or string, number, boolean, array, or object literals.
src/lib/onboarding-owner-integration.ts(225,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
src/lib/onboarding-owner-integration.ts(232,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
src/lib/onboarding-owner-integration.ts(255,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
TSC_PIPE_EXIT=2
```

## Desbloqueo exacto

El agente responsable de `src/lib/onboarding-owner-integration.ts` debe
corregir sus cinco errores TypeScript. El responsable del runner debe restaurar
la inclusión canónica de `src/lib/**/*.test.ts` o acordar el runner oficial.
Después hay que repetir literalmente:

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts
```

El control plane de Paperclip no respondió en `127.0.0.1:3100`, por lo que no
se pudo publicar el comentario ni cambiar el estado remoto durante este
heartbeat. No se reintentará en bucle.

Vault: añadida esta nota; no cambian Decisiones ni Backlog porque no surgió una
nueva decisión de producto, pricing, seguridad o arquitectura.

## Revalidación del mismo heartbeat — 2026-08-25 09:49

- Se agregó de forma aditiva `src/**/*.test.ts` y `src/**/*.test.tsx` al
  `include` existente de `vitest.config.ts`, conservando `tests/**` y
  `mobile/**`.
- `pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts` ahora
  descubre la suite y termina `Tests 18 passed (18)`.
- `pnpm exec tsc --noEmit` termina con código no cero por cinco errores en el
  archivo paralelo `src/lib/onboarding-owner-integration.ts`; no se modificó
  ese archivo. ZAL-687 permanece `blocked`.
- Owner/action exactos: responsable del integrador onboarding owner/ZAL-908;
  corregir los cinco errores TS y repetir el typecheck canónico. Después de
  eso, revalidar el criterio completo de ZAL-687.

Vault: sincronizada esta nota y `Changelog interno.md`; `Decisiones.md` y
`Backlog priorizado.md` no cambian.

El comentario de evidencia y el PATCH remoto a `blocked` no pudieron
publicarse porque Paperclip devolvió `HTTP_STATUS:000` por conexión rechazada
en `127.0.0.1:3100`. No se reintentaron en bucle; el estado remoto queda
pendiente de recuperación del control plane.

## Revalidación final — 2026-08-25 10:45

- Los cuatro archivos siguen hidratados (`flags=-`).
- `vitest.config.ts` quedó estabilizado con `threads`, un worker y sin
  paralelismo de archivos para que el comando canónico descubra y ejecute la
  suite focal. `pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts`
  termina con `Tests 18 passed (18)`.
- `pnpm exec tsc --noEmit --pretty false` permaneció sin salida durante más de
  tres minutos y se interrumpió con `Ctrl-C` (`TSC_EXIT=1`), por lo que sigue
  incumpliendo el límite de 60 s. No se modificó el archivo paralelo
  `src/lib/onboarding-owner-integration.ts`.
- Owner/action: responsable de ZAL-908 debe corregir los cinco errores
  TypeScript de ese archivo, repetir el typecheck canónico y revalidar ambos
  criterios de ZAL-687.

Evidencia literal de esta revalidación:

```text
$ ls -la vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1438 Aug 25 10:40 vitest.config.ts
$ wc -l vitest.config.ts
      47 vitest.config.ts

$ ls -la src/types/athletes.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5405 Aug 23 11:27 src/types/athletes.ts
$ wc -l src/types/athletes.ts
     212 src/types/athletes.ts
$ stat -f '%N flags=%Sf size=%z' src/types/athletes.ts
src/types/athletes.ts flags=- size=5405

$ ls -la src/types/config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  129 Aug 23 11:27 src/types/config.ts
$ wc -l src/types/config.ts
       6 src/types/config.ts
$ stat -f '%N flags=%Sf size=%z' src/types/config.ts
src/types/config.ts flags=- size=129

$ ls -la src/types/event-form.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4595 Aug 23 11:27 src/types/event-form.ts
$ wc -l src/types/event-form.ts
     131 src/types/event-form.ts
$ stat -f '%N flags=%Sf size=%z' src/types/event-form.ts
src/types/event-form.ts flags=- size=4595

$ ls -la src/types/onboarding.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  783 Aug 23 11:27 src/types/onboarding.ts
$ wc -l src/types/onboarding.ts
      38 src/types/onboarding.ts
$ stat -f '%N flags=%Sf size=%z' src/types/onboarding.ts
src/types/onboarding.ts flags=- size=783

$ ls -la src/lib/dashboard/attention-priority.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10521 Aug 25 11:29 src/lib/dashboard/attention-priority.test.ts
$ wc -l src/lib/dashboard/attention-priority.test.ts
     338 src/lib/dashboard/attention-priority.test.ts
$ grep -c "  it(" src/lib/dashboard/attention-priority.test.ts
18

$ ls -la src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9790 Aug 25 06:56 src/lib/onboarding-owner-integration.ts
$ wc -l src/lib/onboarding-owner-integration.ts
     320 src/lib/onboarding-owner-integration.ts

$ pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ src/lib/dashboard/attention-priority.test.ts (18 tests) 64ms
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ pnpm exec tsc --noEmit --pretty false
^C
```

Disposición local: `blocked`, nunca `done`/`PASS`. ZAL-687 no puede cerrarse
hasta que el responsable de ZAL-908 deje el typecheck en exit 0 y por debajo de
60 s.

## Revalidación tras hand-back — 2026-08-25 10:20

- El checkout de Paperclip se recuperó y la issue volvió a tener ruta accionable.
- Los cuatro archivos siguen hidratados (`stat -f '%Sf'` devuelve `flags=-`); no
  hay diff local en `src/types/athletes.ts`, `config.ts`, `event-form.ts` ni
  `onboarding.ts`.
- `pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts` termina
  con `Tests  18 passed (18)` en 31.00 s.
- `pnpm exec tsc --noEmit` reproduce cinco errores TypeScript en
  `src/lib/onboarding-owner-integration.ts`; una reejecución posterior supera
  90 s sin salida y se interrumpe. No se tocó ese archivo paralelo.

Disposición: continúa `blocked`. Desbloqueo exacto: el responsable de
ZAL-908/onboarding owner debe corregir los cinco errores TS de
`src/lib/onboarding-owner-integration.ts`, conseguir `pnpm exec tsc --noEmit`
con exit 0 en menos de 60 s y pedir la revalidación completa de ZAL-687.

El comentario de evidencia sí quedó persistido en Paperclip. Los dos intentos
de transición remota a `blocked` fueron rechazados: primero por falta de
`unblockDescriptor` y después porque el schema requiere un objeto distinto en
`unblockDescriptor.owner`. No se hizo un tercer intento; el estado remoto queda
pendiente de la ruta de recuperación del runtime.

## Revalidación de continuación — 2026-08-25 10:05

La hidratación sigue resuelta y el runner focal sigue operativo. El typecheck
canónico continúa bloqueado exclusivamente por cinco errores TypeScript en el
archivo paralelo de onboarding owner; ZAL-687 no lo modifica.

Evidencia literal de esta revalidación:

```text
$ ls -la -- src/types/athletes.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5405 Aug 23 11:27 src/types/athletes.ts
$ wc -l -- src/types/athletes.ts
     212 src/types/athletes.ts
$ stat -f '%N flags=%Sf size=%z' -- src/types/athletes.ts
src/types/athletes.ts flags=- size=5405

$ ls -la -- src/types/config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  129 Aug 23 11:27 src/types/config.ts
$ wc -l -- src/types/config.ts
       6 src/types/config.ts
$ stat -f '%N flags=%Sf size=%z' -- src/types/config.ts
src/types/config.ts flags=- size=129

$ ls -la -- src/types/event-form.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4595 Aug 23 11:27 src/types/event-form.ts
$ wc -l -- src/types/event-form.ts
     131 src/types/event-form.ts
$ stat -f '%N flags=%Sf size=%z' -- src/types/event-form.ts
src/types/event-form.ts flags=- size=4595

$ ls -la -- src/types/onboarding.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  783 Aug 23 11:27 src/types/onboarding.ts
$ wc -l -- src/types/onboarding.ts
      38 src/types/onboarding.ts
$ stat -f '%N flags=%Sf size=%z' -- src/types/onboarding.ts
src/types/onboarding.ts flags=- size=783

$ ls -la -- src/lib/dashboard/attention-priority.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10521 Aug 25 11:29 src/lib/dashboard/attention-priority.test.ts
$ wc -l -- src/lib/dashboard/attention-priority.test.ts
     338 src/lib/dashboard/attention-priority.test.ts
$ grep -c "  it(" src/lib/dashboard/attention-priority.test.ts
18

$ ls -la -- src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9790 Aug 25 06:56 src/lib/onboarding-owner-integration.ts
$ wc -l -- src/lib/onboarding-owner-integration.ts
     320 src/lib/onboarding-owner-integration.ts

$ pnpm exec tsc --noEmit --pretty false
src/lib/onboarding-owner-integration.ts(65,5): error TS2322: Type '{ done: boolean; }' is not assignable to type 'NextPendingResult'.
  Type '{ done: boolean; }' is missing the following properties from type '{ done: false; key: "add_5_athletes" | "create_first_group" | "setup_weekly_schedule" | "invite_first_coach" | "enable_payments" | "send_first_communication" | "login_again"; label: string; description: string; }': key, label, description
src/lib/onboarding-owner-integration.ts(82,38): error TS1355: A 'const' assertions can only be applied to references to enum members, or string, number, boolean, array, or object literals.
src/lib/onboarding-owner-integration.ts(225,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
src/lib/onboarding-owner-integration.ts(232,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
src/lib/onboarding-owner-integration.ts(255,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
TSC_EXIT=1

$ pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts
 ✓ src/lib/dashboard/attention-priority.test.ts (18 tests) 951ms
      Tests  18 passed (18)
   Duration  9.76s (transform 744ms, setup 1.52s, collect 234ms, tests 951ms, environment 0ms, prepare 524ms)
VITEST_EXIT=0
```

Disposición local: `blocked`, nunca `done`/`PASS`. Owner del desbloqueo:
responsable de `src/lib/onboarding-owner-integration.ts`/ZAL-908. Acción
exacta: corregir sus cinco errores TypeScript y repetir ambos controles.

## Revalidación de continuación — 2026-08-25 11:11

La hidratación no regresó: los cuatro archivos mantienen `flags=-` y la
lectura binaria de cada uno termina correctamente. La suite focal canónica
descubre el archivo y pasa. El typecheck termina dentro del heartbeat, pero
falla por cinco errores del archivo paralelo de onboarding owner; este issue
no modifica ese trabajo.

Evidencia literal:

```text
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5405 Aug 23 11:27 src/types/athletes.ts
     212 src/types/athletes.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  129 Aug 23 11:27 src/types/config.ts
       6 src/types/config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4595 Aug 23 11:27 src/types/event-form.ts
     131 src/types/event-form.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  783 Aug 23 11:27 src/types/onboarding.ts
      38 src/types/onboarding.ts
src/types/athletes.ts flags=- size=5405
src/types/config.ts flags=- size=129
src/types/event-form.ts flags=- size=4595
src/types/onboarding.ts flags=- size=783
18

 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ src/lib/dashboard/attention-priority.test.ts (18 tests) 25ms
 Test Files 1 passed (1)
      Tests 18 passed (18)

src/lib/onboarding-owner-integration.ts(65,5): error TS2322
src/lib/onboarding-owner-integration.ts(82,38): error TS1355
src/lib/onboarding-owner-integration.ts(225,7): error TS2322
src/lib/onboarding-owner-integration.ts(232,7): error TS2322
src/lib/onboarding-owner-integration.ts(255,7): error TS2322
TSC_EXIT=1
```

Disposición local: `blocked`, nunca `done`/`PASS`. Owner del desbloqueo:
responsable de ZAL-908; acción exacta: corregir esos cinco errores, repetir
`pnpm exec tsc --noEmit --pretty false` y `pnpm exec vitest run
src/lib/dashboard/attention-priority.test.ts`, y revalidar ZAL-687.

## Revalidación fresca de continuación — 2026-08-25

- Los cuatro archivos siguen hidratados (`flags=-`) y la suite focal continúa
  descubriéndose y pasando.
- El typecheck canónico sigue sin cumplir el criterio: la ejecución directa
  superó dos minutos y se interrumpió; una ejecución acotada reprodujo los
  cinco errores TypeScript de `src/lib/onboarding-owner-integration.ts`.
- Disposición local: `blocked`. Owner/action: responsable de ZAL-908 debe
  corregir ese archivo paralelo, conseguir `pnpm exec tsc --noEmit` en menos de
  60 s con exit 0 y pedir la revalidación completa de ZAL-687.
- Paperclip continuó no disponible (`curl` no pudo conectar a
  `127.0.0.1:3100`); no se reintentó la escritura remota en bucle.

Evidencia literal de esta revalidación:

```text
$ ls -la -- src/types/athletes.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5405 Aug 23 11:27 src/types/athletes.ts
$ wc -l -- src/types/athletes.ts
     212 src/types/athletes.ts
src/types/athletes.ts flags=- size=5405

$ ls -la -- src/types/config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  129 Aug 23 11:27 src/types/config.ts
$ wc -l -- src/types/config.ts
       6 src/types/config.ts
src/types/config.ts flags=- size=129

$ ls -la -- src/types/event-form.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4595 Aug 23 11:27 src/types/event-form.ts
$ wc -l -- src/types/event-form.ts
     131 src/types/event-form.ts
src/types/event-form.ts flags=- size=4595

$ ls -la -- src/types/onboarding.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  783 Aug 23 11:27 src/types/onboarding.ts
$ wc -l -- src/types/onboarding.ts
      38 src/types/onboarding.ts
src/types/onboarding.ts flags=- size=783

$ ls -la -- src/lib/dashboard/attention-priority.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10521 Aug 25 11:29 src/lib/dashboard/attention-priority.test.ts
$ wc -l -- src/lib/dashboard/attention-priority.test.ts
     338 src/lib/dashboard/attention-priority.test.ts
$ grep -c "  it(" src/lib/dashboard/attention-priority.test.ts
18

$ ls -la -- src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9790 Aug 25 06:56 src/lib/onboarding-owner-integration.ts
$ wc -l -- src/lib/onboarding-owner-integration.ts
     320 src/lib/onboarding-owner-integration.ts

$ pnpm exec vitest run src/lib/dashboard/attention-priority.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ src/lib/dashboard/attention-priority.test.ts (18 tests) 82ms
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ time pnpm exec tsc --noEmit --pretty false
pnpm exec tsc --noEmit --pretty false  12.87s user 4.00s system 13% cpu 2:03.72 total
EXIT_CODE=130
```

No se tocó `src/lib/onboarding-owner-integration.ts` ni ningún archivo de
producto. `Decisiones.md` y `Backlog priorizado.md` no cambian porque no surgió
una decisión de producto, pricing, seguridad o arquitectura.
