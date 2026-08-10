import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Biometrics from './index';

// Lock biométrico de la app (ver index.ts). Auth-critical: un cambio
// aquí puede romper el BiometricGate sin que typecheck lo detecte.
// Se cubre con SecureStore y LocalAuthentication mockeados — sin
// esto, un refactor del threshold de 30s o del fallback biométrico
// pasa sin red de seguridad.

const { secureGetItem, secureSetItem, hasHardware, isEnrolled, authenticateAsync } =
  vi.hoisted(() => ({
    secureGetItem: vi.fn(),
    secureSetItem: vi.fn(),
    hasHardware: vi.fn(),
    isEnrolled: vi.fn(),
    authenticateAsync: vi.fn(),
  }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: secureGetItem,
  setItemAsync: secureSetItem,
}));

vi.mock('expo-local-authentication', () => ({
  hasHardwareAsync: hasHardware,
  isEnrolledAsync: isEnrolled,
  authenticateAsync,
}));

describe('biometrics - lock biométrico de la app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults seguros para que un test que olvide mockear falle
    // ruidosamente en vez de pasar por accidente.
    secureGetItem.mockResolvedValue(null);
    secureSetItem.mockResolvedValue(undefined);
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(true);
    authenticateAsync.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isLockEnabled', () => {
    it('default ON cuando SecureStore no tiene el flag (aún no se desactivó)', async () => {
      secureGetItem.mockResolvedValue(null);
      expect(await Biometrics.isLockEnabled()).toBe(true);
    });

    it('"1" → lock activo', async () => {
      secureGetItem.mockResolvedValue('1');
      expect(await Biometrics.isLockEnabled()).toBe(true);
    });

    it('"0" → lock desactivado (usuario lo apagó en Perfil)', async () => {
      secureGetItem.mockResolvedValue('0');
      expect(await Biometrics.isLockEnabled()).toBe(false);
    });

    it('un valor distinto de "1" se trata como desactivado (defensa ante escrituras basura)', async () => {
      secureGetItem.mockResolvedValue('true');
      expect(await Biometrics.isLockEnabled()).toBe(false);
    });

    it('si SecureStore lanza al leer, devolvemos false en vez de propagar la excepción', async () => {
      secureGetItem.mockRejectedValue(new Error('SecureStore no disponible'));
      expect(await Biometrics.isLockEnabled()).toBe(false);
    });
  });

  describe('setLockEnabled', () => {
    it('persiste "1" cuando se activa el lock', async () => {
      await Biometrics.setLockEnabled(true);
      expect(secureSetItem).toHaveBeenCalledWith('biometric_lock_enabled', '1');
    });

    it('persiste "0" cuando se desactiva el lock', async () => {
      await Biometrics.setLockEnabled(false);
      expect(secureSetItem).toHaveBeenCalledWith('biometric_lock_enabled', '0');
    });
  });

  describe('recordActiveNow / secondsSinceLastActive', () => {
    it('recordActiveNow escribe el timestamp actual en segundos Epoch como string', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      await Biometrics.recordActiveNow();
      expect(secureSetItem).toHaveBeenCalledWith('last_active_at', Date.now().toString());
    });

    it('secondsSinceLastActive devuelve null si no hay timestamp previo', async () => {
      secureGetItem.mockResolvedValue(null);
      expect(await Biometrics.secondsSinceLastActive()).toBeNull();
    });

    it('secondsSinceLastActive calcula los segundos transcurridos redondeando hacia abajo', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      // 45s antes de "ahora" → esperamos 45 (floor)
      secureGetItem.mockResolvedValue((Date.now() - 45_000).toString());
      expect(await Biometrics.secondsSinceLastActive()).toBe(45);
    });

    it('secondsSinceLastActive redondea hacia abajo (no hacia el entero más cercano)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      // 45.7s → Math.floor → 45, no 46
      secureGetItem.mockResolvedValue((Date.now() - 45_700).toString());
      expect(await Biometrics.secondsSinceLastActive()).toBe(45);
    });

    it('si SecureStore lanza al leer, devolvemos null en vez de propagar la excepción', async () => {
      secureGetItem.mockRejectedValue(new Error('lectura fallida'));
      expect(await Biometrics.secondsSinceLastActive()).toBeNull();
    });
  });

  describe('canUseBiometrics', () => {
    it('sin hardware biométrico → false', async () => {
      hasHardware.mockResolvedValue(false);
      expect(await Biometrics.canUseBiometrics()).toBe(false);
    });

    it('con hardware pero sin enrolment (Face ID / huella no configurados) → false', async () => {
      hasHardware.mockResolvedValue(true);
      isEnrolled.mockResolvedValue(false);
      expect(await Biometrics.canUseBiometrics()).toBe(false);
    });

    it('con hardware y enrolment → true', async () => {
      hasHardware.mockResolvedValue(true);
      isEnrolled.mockResolvedValue(true);
      expect(await Biometrics.canUseBiometrics()).toBe(true);
    });

    it('si LocalAuthentication lanza, devolvemos false en vez de propagar la excepción', async () => {
      hasHardware.mockRejectedValue(new Error('API no disponible'));
      expect(await Biometrics.canUseBiometrics()).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('devuelve true cuando el usuario completa Face ID / huella con éxito', async () => {
      authenticateAsync.mockResolvedValue({ success: true });
      expect(await Biometrics.authenticate('Desbloquear Zaltyko')).toBe(true);
    });

    it('devuelve false cuando el usuario cancela o falla la autenticación', async () => {
      authenticateAsync.mockResolvedValue({ success: false });
      expect(await Biometrics.authenticate('Desbloquear Zaltyko')).toBe(false);
    });

    it('si LocalAuthentication lanza una excepción, devolvemos false en vez de propagarla', async () => {
      authenticateAsync.mockRejectedValue(new Error('biometría no disponible'));
      expect(await Biometrics.authenticate('Desbloquear Zaltyko')).toBe(false);
    });

    it('pasa el reason como promptMessage al API nativa', async () => {
      await Biometrics.authenticate('Confirmar asistencia');
      expect(authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ promptMessage: 'Confirmar asistencia' }),
      );
    });
  });

  describe('needsReauth', () => {
    it('si el lock está desactivado, no pide reauth', async () => {
      secureGetItem.mockImplementation(async (key: string) => {
        if (key === 'biometric_lock_enabled') return '0';
        return null;
      });
      expect(await Biometrics.needsReauth()).toBe(false);
    });

    it('si el dispositivo no soporta biometría, no pide reauth (no podemos validar)', async () => {
      hasHardware.mockResolvedValue(false);
      expect(await Biometrics.needsReauth()).toBe(false);
    });

    it('si no hay timestamp de última actividad, pide reauth (primera vuelta al foreground)', async () => {
      secureGetItem.mockImplementation(async (key: string) => {
        if (key === 'biometric_lock_enabled') return '1';
        return null; // sin last_active_at
      });
      expect(await Biometrics.needsReauth()).toBe(true);
    });

    it('si han pasado más de N segundos (default 30), pide reauth', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      secureGetItem.mockImplementation(async (key: string) => {
        if (key === 'biometric_lock_enabled') return '1';
        if (key === 'last_active_at') return (Date.now() - 60_000).toString();
        return null;
      });
      expect(await Biometrics.needsReauth()).toBe(true);
    });

    it('si NO han pasado más de N segundos, NO pide reauth (cambio rápido de app)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      secureGetItem.mockImplementation(async (key: string) => {
        if (key === 'biometric_lock_enabled') return '1';
        if (key === 'last_active_at') return (Date.now() - 10_000).toString();
        return null;
      });
      expect(await Biometrics.needsReauth()).toBe(false);
    });

    it('acepta un threshold custom (no solo el default de 30s)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      secureGetItem.mockImplementation(async (key: string) => {
        if (key === 'biometric_lock_enabled') return '1';
        if (key === 'last_active_at') return (Date.now() - 90_000).toString(); // 90s
        return null;
      });
      // Con threshold=120 no pide reauth
      expect(await Biometrics.needsReauth(120)).toBe(false);
      // Con threshold=60 sí pide reauth
      expect(await Biometrics.needsReauth(60)).toBe(true);
    });
  });
});
