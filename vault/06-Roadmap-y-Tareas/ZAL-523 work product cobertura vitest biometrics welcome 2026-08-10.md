---
issue: ZAL-523
agente: Mobile Developer
fecha: 2026-08-10
branch: zaltyko-onboarding-ZAL-137
commit: d5da632ec1238aff9e8dca0be39f97c8ddeaefbc
status: ready-for-review
---

# ZAL-523 — Cobertura vitest para lib/biometrics y lib/onboarding/welcome

## Resumen

Cerrado el gap crítico de auth: 29 tests nuevos (23 biometrics + 6 welcome) dan red de seguridad a los dos módulos identificados sin cobertura en el barrido ZAL-396/ZAL-501. Sin tests, cualquier refactor del threshold de reauth (30s) o del flag de bienvenida pasa sin red de seguridad.

## Cambios

| Archivo | LOC | Tests | Cubre |
|---|---|---|---|
| `mobile/lib/biometrics/index.test.ts` | 200 | 23 | `isLockEnabled`, `setLockEnabled`, `recordActiveNow`, `secondsSinceLastActive`, `canUseBiometrics`, `authenticate`, `needsReauth` |
| `mobile/lib/onboarding/welcome.test.ts` | 75 | 6 | `hasSeenWelcome`, `markWelcomeSeen` |

## Cobertura por función

### `lib/biometrics/index.ts` (23 tests)

- **`isLockEnabled` (6)**: default ON cuando SecureStore devuelve `null`, `"1"`→true, `"0"`→false, valor legacy (ej. `"enabled"`)→false (freno de seguridad), error de SecureStore→false.
- **`setLockEnabled` (1)**: persiste `"1"` / `"0"` correctamente.
- **`recordActiveNow` / `secondsSinceLastActive` (4)**: persistencia de timestamp actual, parseo correcto de segundos, `null` en ausencia de valor previo, `null` ante error (fail-closed para reauth).
- **`canUseBiometrics` (4)**: sin hardware→false, con hardware pero sin enrolment→false, ambos OK→true, excepción→false.
- **`authenticate` (3)**: éxito→true, cancelación→false, excepción→false; verifica `cancelLabel: 'Cancelar'`, `fallbackLabel: 'Usar contraseña'`, `disableDeviceFallback: false`.
- **`needsReauth` (6)**: lock off→false sin consultar hardware; sin biometría→false (fallback a Supabase); `since=null`→true (cold-start); `since` dentro del threshold→false; `since` más allá→true; threshold custom honrado.

### `lib/onboarding/welcome.ts` (6 tests)

- **`hasSeenWelcome` (4)**: `"1"`→true, `null`→false, legacy `"true"`→false (freno), error de AsyncStorage→true (no bloquear).
- **`markWelcomeSeen` (2)**: persiste `"1"` bajo `welcome_seen_v1`; propaga errores (la caller decide UX).

## Mocks

- `expo-secure-store` (`getItemAsync`/`setItemAsync`)
- `expo-local-authentication` (`hasHardwareAsync`/`isEnrolledAsync`/`authenticateAsync`) — mockeado como named exports + `default` para resolver `import * as LocalAuthentication` en el código bajo test
- `@react-native-async-storage/async-storage` (`getItem`/`setItem`) — bajo `default` para resolver `import AsyncStorage from ...`

`vi.hoisted` para evitar el TDZ de los `vi.fn()` que `vi.mock` captura al ser elevado al tope. `vi.resetAllMocks()` (no `clearAllMocks`) en `beforeEach` para limpiar también las colas de `mockResolvedValueOnce` entre tests.

## Verificación

```text
$ pnpm test
 Test Files  6 passed (6)
      Tests  81 passed (81)
```

- ✅ Antes: 52 tests / 4 archivos. Ahora: **81 tests / 6 archivos** (+29).
- ✅ `tsc --noEmit` limpio.
- ✅ `eslint lib/biometrics/index.test.ts lib/onboarding/welcome.test.ts` limpio.
- ✅ Sin cambios fuera de `mobile/lib/biometrics/` y `mobile/lib/onboarding/`.

## Commit reproducible

```text
SHA:   d5da632ec1238aff9e8dca0be39f97c8ddeaefbc
Título: test(mobile): ZAL-523 cobertura vitest para lib/biometrics y lib/onboarding/welcome
Branch: zaltyko-onboarding-ZAL-137
```

## Próximo paso

- **Peer-verification C-2 (Web Developer)**: clonar `peer-zal523-c2-<sha>` con HEAD pinned a `d5da632ec`, ejecutar `pnpm test`, validar cobertura contra este work product.
- **Cierre ZAL-523**: tras el C-2 PASS, `PATCH done` con el SHA reproducible registrado.