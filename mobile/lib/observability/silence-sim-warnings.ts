// Silencia los warnings de console y desinstala LogBox para que el simulador
// iOS sin provisioning real (errSecMissingEntitlement -34018) no muestre el
// toast "Open debugger to view warnings" sobre la UI de la app.
//
// Por qué este archivo y no app/_layout.tsx:
//   - app/_layout.tsx importa PushProvider, que carga expo-notifications, que
//     dispara el warning DURANTE el import. Cualquier override a nivel de
//     módulo dentro de _layout.tsx llega demasiado tarde.
//   - Este archivo se carga desde index.ts ANTES de expo-router/entry.
//
// Limitación conocida: el toast persiste hasta que el usuario lo descarta con
// X, porque React Native inicializa LogBox ANTES de nuestro código y captura
// el warning de expo-notifications durante la carga de expo-router. Para
// builds de producción / device real con Keychain funcional estos warnings
// no se producen.

import { LogBox } from 'react-native';

const SILENCED_PATTERNS: RegExp[] = [
  /\[expo-notifications\] Error reading persisted/,
  /ERR_NOTIFICATIONS_KEYCHAIN_ACCESS/,
  /getRegistrationInfoAsync/,
  /KeyChainException/,
  /A required entitlement/,
  /ExpoSecureStore/,
  /-34018/,
];

const shouldSilence = (first: unknown): boolean =>
  typeof first === 'string' &&
  SILENCED_PATTERNS.some((pat) => pat.test(first));

const installConsoleOverrides = (): void => {
  const origWarn = console.warn;
  const origError = console.error;
  const wrap = (orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (shouldSilence(args[0])) return;
      orig.apply(console, args);
    };
  console.warn = wrap(origWarn);
  console.error = wrap(origError);
};

const uninstallLogBox = (): void => {
  try {
    LogBox.uninstall();
  } catch {
    // LogBox aún no está listo.
  }
};

const ignoreLogs = (): void => {
  try {
    LogBox.ignoreAllLogs();
    LogBox.ignoreLogs(SILENCED_PATTERNS);
  } catch {
    // noop
  }
};

if (__DEV__) {
  installConsoleOverrides();
  uninstallLogBox();
  ignoreLogs();

  // Re-aplicar en cada momento clave del ciclo de vida para cubrir
  // reinstalaciones tardías de LogBox.
  const REINSTALL_AT = [0, 10, 50, 200, 500, 1000, 2000, 5000];
  REINSTALL_AT.forEach((delay) => {
    setTimeout(() => {
      installConsoleOverrides();
      uninstallLogBox();
      ignoreLogs();
    }, delay);
  });
  queueMicrotask(() => {
    installConsoleOverrides();
    uninstallLogBox();
    ignoreLogs();
  });

  // @ts-expect-error - console.disableYellowBox no está tipado en RN 0.86.
  console.disableYellowBox = true;
}