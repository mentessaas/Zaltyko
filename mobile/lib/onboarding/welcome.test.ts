// Cobertura vitest del flag de bienvenida (lib/onboarding/welcome.ts).
// UX state: si WelcomeGate muestra la pantalla cada vez por un fallo
// de AsyncStorage, todos los nuevos usuarios ven el onboarding dos
// veces y el funnel de activación cae. Mantener este test verde
// garantiza que no rompemos el contrato "una vez por dispositivo".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasSeenWelcome, markWelcomeSeen } from './welcome';

// vi.hoisted garantiza que los vi.fn() existan antes del vi.mock hoisted.
const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

// AsyncStorage se importa con default import (`import AsyncStorage from ...`),
// por eso el mock expone la API bajo `default`.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: storage.getItem, setItem: storage.setItem },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onboarding/welcome', () => {
  describe('hasSeenWelcome', () => {
    it('devuelve true cuando AsyncStorage tiene "1" (caso normal post-onboarding)', async () => {
      storage.getItem.mockResolvedValueOnce('1');

      await expect(hasSeenWelcome()).resolves.toBe(true);
      expect(storage.getItem).toHaveBeenCalledWith('welcome_seen_v1');
    });

    it('devuelve false con cualquier valor distinto de "1" (incluye null inicial)', async () => {
      storage.getItem.mockResolvedValueOnce(null);

      await expect(hasSeenWelcome()).resolves.toBe(false);
    });

    it('devuelve false si AsyncStorage tiene un valor legacy inesperado (ej. "true")', async () => {
      // Freno: si una versión vieja guardó "true" en vez de "1",
      // NO queremos saltarnos la bienvenida para usuarios nuevos.
      storage.getItem.mockResolvedValueOnce('true');

      await expect(hasSeenWelcome()).resolves.toBe(false);
    });

    it('si AsyncStorage falla, devolvemos true para NO bloquear al usuario con la bienvenida', async () => {
      // Decisión de producto: un fallo de storage NO debe mostrar
      // la bienvenida en bucle. Mejor pasarla por alto y dejar
      // que el resto de la app funcione.
      storage.getItem.mockRejectedValueOnce(new Error('Storage unavailable'));

      await expect(hasSeenWelcome()).resolves.toBe(true);
    });
  });

  describe('markWelcomeSeen', () => {
    it('persiste exactamente "1" bajo la clave estable welcome_seen_v1', async () => {
      storage.setItem.mockResolvedValueOnce(undefined);

      await markWelcomeSeen();

      expect(storage.setItem).toHaveBeenCalledWith('welcome_seen_v1', '1');
    });

    it('propaga errores de AsyncStorage (la caller decide cómo manejar UI)', async () => {
      storage.setItem.mockRejectedValueOnce(new Error('Quota exceeded'));

      await expect(markWelcomeSeen()).rejects.toThrow('Quota exceeded');
    });
  });
});