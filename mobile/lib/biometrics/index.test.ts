// Cobertura vitest del lock biométrico (lib/biometrics/index.ts).
// Auth-critical: cualquier refactor del threshold de 30s o del fallback
// debe pasar por estos tests antes de tocar BiometricGate o AppGate.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLockEnabled,
  setLockEnabled,
  recordActiveNow,
  secondsSinceLastActive,
  canUseBiometrics,
  authenticate,
  needsReauth,
} from './index';

// vi.hoisted garantiza que los vi.fn() existan antes de que vi.mock
// capture las referencias (vi.mock se eleva al tope del archivo).
const mocks = vi.hoisted(() => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: mocks.getItemAsync,
  setItemAsync: mocks.setItemAsync,
}));

// El módulo se importa con `import * as LocalAuthentication` en el
// código bajo test; vitest expone los mocks tanto como named exports
// como bajo `default` para que el namespace binding los encuentre.
vi.mock('expo-local-authentication', () => {
  const ns = {
    hasHardwareAsync: mocks.hasHardwareAsync,
    isEnrolledAsync: mocks.isEnrolledAsync,
    authenticateAsync: mocks.authenticateAsync,
  };
  return { ...ns, default: ns };
});

beforeEach(() => {
  // resetAllMocks (no clearAllMocks) — también limpia las colas de
  // mockResolvedValueOnce entre tests, no solo calls/results.
  vi.resetAllMocks();
  mocks.setItemAsync.mockResolvedValue(undefined);
});

describe('biometrics — flag de lock', () => {
  it('isLockEnabled: si SecureStore devuelve null (primera vez) el default es ON', async () => {
    mocks.getItemAsync.mockResolvedValueOnce(null);

    await expect(isLockEnabled()).resolves.toBe(true);
    expect(mocks.getItemAsync).toHaveBeenCalledWith('biometric_lock_enabled');
  });

  it('isLockEnabled: el valor "1" se interpreta como habilitado', async () => {
    mocks.getItemAsync.mockResolvedValueOnce('1');

    await expect(isLockEnabled()).resolves.toBe(true);
  });

  it('isLockEnabled: el valor "0" se interpreta como deshabilitado', async () => {
    mocks.getItemAsync.mockResolvedValueOnce('0');

    await expect(isLockEnabled()).resolves.toBe(false);
  });

  it('isLockEnabled: un valor distinto de "1"/"0"/null (basura legacy) cae a false, no a true', async () => {
    // Freno de seguridad: si una versión vieja guardó "enabled" o
    // cualquier otro string, NO queremos rehabilitar el lock sin
    // que el usuario lo pidiera.
    mocks.getItemAsync.mockResolvedValueOnce('enabled');

    await expect(isLockEnabled()).resolves.toBe(false);
  });

  it('isLockEnabled: si SecureStore lanza, devolvemos false en vez de romper la app', async () => {
    mocks.getItemAsync.mockRejectedValueOnce(new Error('Keychain not available'));

    await expect(isLockEnabled()).resolves.toBe(false);
  });

  it('setLockEnabled(true) persiste "1"; setLockEnabled(false) persiste "0"', async () => {
    await setLockEnabled(true);
    expect(mocks.setItemAsync).toHaveBeenLastCalledWith('biometric_lock_enabled', '1');

    await setLockEnabled(false);
    expect(mocks.setItemAsync).toHaveBeenLastCalledWith('biometric_lock_enabled', '0');
  });
});

describe('biometrics — timestamp de última actividad', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('recordActiveNow persiste el timestamp actual en milisegundos', async () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    await recordActiveNow();

    expect(mocks.setItemAsync).toHaveBeenCalledWith('last_active_at', now.toString());
  });

  it('secondsSinceLastActive: si no hay valor previo, devolvemos null (no 0)', async () => {
    mocks.getItemAsync.mockResolvedValueOnce(null);

    await expect(secondsSinceLastActive()).resolves.toBeNull();
  });

  it('secondsSinceLastActive: parsea el timestamp y devuelve los segundos transcurridos', async () => {
    const last = 1_700_000_000_000;
    const now = last + 45_000; // 45 segundos después
    vi.setSystemTime(now);
    mocks.getItemAsync.mockResolvedValueOnce(last.toString());

    await expect(secondsSinceLastActive()).resolves.toBe(45);
  });

  it('secondsSinceLastActive: si la lectura falla, devolvemos null (fail-closed para reauth)', async () => {
    mocks.getItemAsync.mockRejectedValueOnce(new Error('Keychain error'));

    await expect(secondsSinceLastActive()).resolves.toBeNull();
  });
});

describe('biometrics — capacidad del dispositivo', () => {
  it('canUseBiometrics: sin hardware devuelve false', async () => {
    mocks.hasHardwareAsync.mockResolvedValueOnce(false);
    mocks.isEnrolledAsync.mockResolvedValueOnce(true);

    await expect(canUseBiometrics()).resolves.toBe(false);
    expect(mocks.isEnrolledAsync).not.toHaveBeenCalled();
  });

  it('canUseBiometrics: con hardware pero sin enrolment devuelve false', async () => {
    mocks.hasHardwareAsync.mockResolvedValueOnce(true);
    mocks.isEnrolledAsync.mockResolvedValueOnce(false);

    await expect(canUseBiometrics()).resolves.toBe(false);
  });

  it('canUseBiometrics: con hardware y enrolment devuelve true', async () => {
    mocks.hasHardwareAsync.mockResolvedValueOnce(true);
    mocks.isEnrolledAsync.mockResolvedValueOnce(true);

    await expect(canUseBiometrics()).resolves.toBe(true);
  });

  it('canUseBiometrics: si las llamadas nativas lanzan, devolvemos false en lugar de romper', async () => {
    mocks.hasHardwareAsync.mockRejectedValueOnce(new Error('Native module crashed'));

    await expect(canUseBiometrics()).resolves.toBe(false);
  });
});

describe('biometrics — authenticate', () => {
  it('devuelve true si la autenticación nativa fue exitosa', async () => {
    mocks.authenticateAsync.mockResolvedValueOnce({ success: true });

    await expect(authenticate('Desbloquear Zaltyko')).resolves.toBe(true);
    expect(mocks.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: 'Desbloquear Zaltyko',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar contraseña',
        disableDeviceFallback: false,
      }),
    );
  });

  it('devuelve false si el usuario cancela o falla la auth', async () => {
    mocks.authenticateAsync.mockResolvedValueOnce({ success: false });

    await expect(authenticate('Desbloquear Zaltyko')).resolves.toBe(false);
  });

  it('devuelve false si la llamada nativa lanza una excepción', async () => {
    mocks.authenticateAsync.mockRejectedValueOnce(new Error('User canceled'));

    await expect(authenticate('Desbloquear Zaltyko')).resolves.toBe(false);
  });
});

describe('biometrics — needsReauth (combinación)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('con el lock desactivado NO requiere reauth, aunque haya pasado mucho tiempo', async () => {
    mocks.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'biometric_lock_enabled') return '0';
      if (key === 'last_active_at') return (Date.now() - 999_000).toString();
      return null;
    });

    await expect(needsReauth(30)).resolves.toBe(false);
    expect(mocks.hasHardwareAsync).not.toHaveBeenCalled();
  });

  it('sin biometría disponible NO requiere reauth (fallback a sesión Supabase ya validada)', async () => {
    mocks.hasHardwareAsync.mockResolvedValueOnce(false);

    await expect(needsReauth(30)).resolves.toBe(false);
  });

  it('sin last-active previo requiere reauth (cold-start tras background largo o fresh install)', async () => {
    mocks.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'biometric_lock_enabled') return '1';
      return null;
    });
    // needsReauth exige pasar canUseBiometrics antes de chequear el timestamp.
    mocks.hasHardwareAsync.mockResolvedValueOnce(true);
    mocks.isEnrolledAsync.mockResolvedValueOnce(true);

    await expect(needsReauth(30)).resolves.toBe(true);
  });

  it('last-active dentro del threshold NO requiere reauth', async () => {
    mocks.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'biometric_lock_enabled') return '1';
      if (key === 'last_active_at') return (Date.now() - 10_000).toString(); // 10s
      return null;
    });
    mocks.hasHardwareAsync.mockResolvedValueOnce(true);
    mocks.isEnrolledAsync.mockResolvedValueOnce(true);

    await expect(needsReauth(30)).resolves.toBe(false);
  });

  it('last-active más allá del threshold SÍ requiere reauth', async () => {
    mocks.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'biometric_lock_enabled') return '1';
      if (key === 'last_active_at') return (Date.now() - 120_000).toString(); // 2 min
      return null;
    });
    mocks.hasHardwareAsync.mockResolvedValueOnce(true);
    mocks.isEnrolledAsync.mockResolvedValueOnce(true);

    await expect(needsReauth(30)).resolves.toBe(true);
  });

  it('honra un threshold personalizado (ej. 5s para tests)', async () => {
    mocks.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'biometric_lock_enabled') return '1';
      if (key === 'last_active_at') return (Date.now() - 8_000).toString(); // 8s
      return null;
    });
    // mockResolvedValue (no _Once) porque hay dos invocaciones: una por
    // cada needsReauth() del test.
    mocks.hasHardwareAsync.mockResolvedValue(true);
    mocks.isEnrolledAsync.mockResolvedValue(true);

    // Threshold 30s → todavía NO requiere auth.
    await expect(needsReauth(30)).resolves.toBe(false);
    // Threshold 5s → ya pasaron 8s, requiere auth.
    await expect(needsReauth(5)).resolves.toBe(true);
  });
});