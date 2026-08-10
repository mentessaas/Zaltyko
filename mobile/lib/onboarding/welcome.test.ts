import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasSeenWelcome, markWelcomeSeen } from './welcome';

// Flag "ya vio la bienvenida" del WelcomeGate. UX state, no dato
// sensible (AsyncStorage, no SecureStore). Se cubre el manejo del
// flag y el fallback que evita bloquear al usuario si AsyncStorage
// falla — sin esto, un refactor del gate puede dejar a nadie pasar.

const { asyncGetItem, asyncSetItem } = vi.hoisted(() => ({
  asyncGetItem: vi.fn(),
  asyncSetItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: asyncGetItem,
    setItem: asyncSetItem,
  },
}));

describe('onboarding/welcome - flag de bienvenida visto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asyncGetItem.mockResolvedValue(null);
    asyncSetItem.mockResolvedValue(undefined);
  });

  describe('hasSeenWelcome', () => {
    it('"1" → el usuario ya vio la bienvenida', async () => {
      asyncGetItem.mockResolvedValue('1');
      expect(await hasSeenWelcome()).toBe(true);
    });

    it('cualquier otro valor (incluido null) → aún no la ha visto', async () => {
      asyncGetItem.mockResolvedValue('0');
      expect(await hasSeenWelcome()).toBe(false);
    });

    it('null (primera instalación) → aún no la ha visto', async () => {
      asyncGetItem.mockResolvedValue(null);
      expect(await hasSeenWelcome()).toBe(false);
    });

    it('si AsyncStorage lanza al leer, devolvemos true (no bloquear al usuario con la bienvenida)', async () => {
      asyncGetItem.mockRejectedValue(new Error('AsyncStorage no disponible'));
      expect(await hasSeenWelcome()).toBe(true);
    });
  });

  describe('markWelcomeSeen', () => {
    it('persiste "1" bajo la clave welcome_seen_v1', async () => {
      await markWelcomeSeen();
      expect(asyncSetItem).toHaveBeenCalledWith('welcome_seen_v1', '1');
    });

    it('una segunda llamada sobreescribe con el mismo valor (idempotente)', async () => {
      await markWelcomeSeen();
      await markWelcomeSeen();
      expect(asyncSetItem).toHaveBeenCalledTimes(2);
      expect(asyncSetItem.mock.calls[0]).toEqual(['welcome_seen_v1', '1']);
      expect(asyncSetItem.mock.calls[1]).toEqual(['welcome_seen_v1', '1']);
    });
  });
});
