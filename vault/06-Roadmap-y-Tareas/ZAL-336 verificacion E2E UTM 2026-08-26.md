# ZAL-336 — Verificación E2E UTM en sandbox (2026-08-26)

## Estado

**Implementación local completada; en revisión independiente**. El harness y el flujo completo ya están en el checkout compartido. No se registra PASS de producción ni readiness.

## Decisión de harness

Se verificó la opción 2 de la issue: Postgres Supabase local + mock de auth estrictamente acotado a NODE_ENV=development y E2E_MOCK_AUTH=1. El navegador recorre el signup, el onboarding y el claim; la aserción SQL lee la fila real de public.academies. No se usaron Supabase remoto, secretos, datos reales ni migraciones remotas.

El clon scratch añadió únicamente soporte local para las tablas/columnas necesarias del wizard y un cookie de usuario sintético. Esos cambios no están integrados en el checkout canónico.

## Cobertura verificada

- Cinco UTM normalizados + utm_landing_path + utm_captured_at + canal paid.
- Entrada directa con los cinco UTM nulos y canal direct.
- Claim por UI de una academia pre-registrada, conservando el snapshot first-touch ante un segundo touch.
- Segundo touch en otra landing sin overwrite de sessionStorage ni de la fila.
- Unit/integration focales de UTM y canal.

## Evidencia literal

Clon scratch usado:

/var/folders/zf/8p19kh3j629_jcyy9q65cmfr0000gn/T/paperclip-run-zal-336-645225db-f3d-2leWBb/zal336-repro.BjETrz

```text
$ ls -la tests/e2e-zaltyko-utm-signup.spec.ts src/lib/supabase/server.ts src/components/RegisterForm.tsx supabase/migrations/20240101000009_sport_config_architecture.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff   7617 Aug 26 07:03 src/components/RegisterForm.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff   2551 Aug 26 06:55 src/lib/supabase/server.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11770 Aug 26 07:12 supabase/migrations/20240101000009_sport_config_architecture.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  18909 Aug 26 07:14 tests/e2e-zaltyko-utm-signup.spec.ts

$ wc -l tests/e2e-zaltyko-utm-signup.spec.ts src/lib/supabase/server.ts src/components/RegisterForm.tsx supabase/migrations/20240101000009_sport_config_architecture.sql
496 tests/e2e-zaltyko-utm-signup.spec.ts
82 src/lib/supabase/server.ts
247 src/components/RegisterForm.tsx
244 supabase/migrations/20240101000009_sport_config_architecture.sql
1069 total

$ grep -c "  it(" tests/e2e-zaltyko-utm-signup.spec.ts
0

$ pnpm exec playwright test --config=playwright.zal336.config.ts tests/e2e-zaltyko-utm-signup.spec.ts
4 passed (1.3m)

$ pnpm exec vitest run tests/gtm-utm-server-normalization.test.ts tests/gtm-utm-capture-navigation.test.tsx tests/gtm-utm.test.ts tests/gtm-canal-create-academy.test.ts 2>&1 | tail -30
Test Files  4 passed (4)
      Tests  64 passed (64)
```

El conteo grep -c del spec es 0 porque es Playwright y declara test(...); por eso no se presenta como N tests en el archivo según el evidence gate.

## Bloqueador y siguiente acción

Owner: Platform & Security / runtime de checkout. Acción exacta: proporcionar un checkout writable de fix/zal-336-utm-signup-e2e en el path canónico, o integrar allí el patch del clon scratch y devolver el SHA verificable desde /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko. Después, QA debe repetir el E2E desde ese checkout. Hasta entonces ZAL-336 queda bloqueado aunque la reproducción local sea verde.

No se actualiza el Changelog de release: no hubo commit integrado, deploy, migración remota, secreto ni cambio de producción.

## Reanudación en checkout compartido — 2026-08-26

La integración ya está presente en el checkout compartido de trabajo (`Zaltyko-fresh`, enlazado al proyecto Zaltyko), por lo que el bloqueo histórico de “spec ausente en checkout canónico” queda superseded para este heartbeat. Se implementó el harness versionado con la opción 2: mock de auth explícito solo en desarrollo, PostgreSQL local sintético y lectura SQL de la fila creada por el POST real de onboarding.

La suite dedicada ejecutó 4 escenarios y terminó con `4 passed (1.1m)`: UTM completo con landing path y timestamp, direct con `direct/none/none/none/none`, claim preservando first-touch y second-touch sin overwrite. La suite unitaria focalizada de UTM terminó con `Tests 37 passed (37)`. No se usaron Supabase remoto, secretos, datos reales ni migraciones remotas.

La evidencia es local/sandbox: no equivale a proveedor Supabase Auth real, QA independiente, producción, readiness ni validación humana. El siguiente gate es revisión independiente de QA y Platform & Security; el autor no aprueba su propio trabajo. `pnpm typecheck` global sigue bloqueado por errores `implicit any` preexistentes fuera de los archivos de ZAL-336.

## Reejecución final del checkout compartido — 2026-08-26

Tras completar el mock de cliente (`getUser`, `getSession`, `signOut` y suscripción), se repitió el flujo contra Next.js en `localhost:3001` y PostgreSQL local efímero:

```text
Running 4 tests using 1 worker
4 passed (1.5m)
```

La evidencia literal del archivo es `grep -c "  test(" tests/e2e-zaltyko-utm-signup.spec.ts` → `4`; el spec Playwright no usa `it(`. La unidad focalizada terminó con `Tests 37 passed (37)`. `grep -c "  it(" tests/growth-utm-capture.test.ts` → `30` porque uno de los bloques es `it.each` parametrizado; no se usa ese grep como conteo total de casos ejecutados. El servidor local emitió warnings best-effort por la tabla `growth_events` ausente en la base sintética; no afectó el POST `201` ni las aserciones de `academies`.

El resultado sigue siendo evidencia local/sandbox y queda pendiente de repetición independiente por QA. Platform & Security emitió aprobación local con una observación menor; esa observación quedó corregida antes de este cierre.

## Hardening y reejecución — 2026-08-26

- `isE2EMockAuthEnabled()` solo acepta `E2E_MOCK_AUTH=1` bajo `NODE_ENV=development`; se eliminó `NEXT_PUBLIC_E2E_MOCK_AUTH` del gate y del formulario. El cliente de navegador se activa en el sandbox únicamente con una cookie local que el harness inyecta, mientras el servidor conserva el gate privado.
- La navegación posterior al signup usa navegación completa hacia el route handler de redirect, y los helpers E2E esperan la hidratación del wizard y del claim antes de interactuar. La configuración fuerza la misma PostgreSQL sintética local para Next y para la lectura SQL.
- Última evidencia local: Playwright `Running 4 tests using 1 worker` y `4 passed (56.6s)`; Vitest focal `Test Files 2 passed (2)` y `Tests 41 passed (41)`; ESLint focal sin errores; `git diff --check` sin salida.
- `pnpm typecheck` global sigue bloqueado por diez errores `implicit any` preexistentes en superficies no relacionadas; no aparecen errores en los archivos de este alcance.
- El sandbox no tiene `growth_events`; los avisos best-effort de ese writer no alteran el `POST /api/onboarding/owner` `201` ni las aserciones SQL de `academies`.

La evidencia permanece separada de Auth remoto, QA independiente, producción, readiness, adopción y validación humana. Siguiente gate: QA debe repetir la suite desde el checkout compartido; no se actuó sobre remoto, secretos, datos reales, Stripe live ni migraciones remotas.

## Revisión independiente QA — 2026-08-26

QA repitió la suite desde el checkout compartido: los cuatro escenarios terminaron `4 passed (2.0m)`. Los tests focales terminaron `Tests 37 passed (37)` para UTM y `Tests 4 passed (4)` para el seam de auth. ESLint focal no produjo errores.

Los negativos verifican que producción no habilita el mock, que la activación cliente requiere la cookie local exacta y que cookies de usuario malformadas se rechazan sin lanzar. La búsqueda bajo `src/` produjo `0 coincidencias en src` para `NEXT_PUBLIC_E2E_MOCK_AUTH`.

Durante el E2E el sandbox emitió warnings `42P01` porque no tiene la tabla opcional `growth_events`; el writer es best-effort y no alteró el POST ni las aserciones de `academies`. Esto no se considera defecto de ZAL-336, pero el fixture local no representa la persistencia de eventos de growth.

Veredicto QA: **PASS local/sandbox**. No equivale a Auth remoto, producción, readiness ni validación humana.
