// Adapter de expo-secure-store para @supabase/supabase-js.
// SecureStore cifra con Keychain (iOS) y Android Keystore (Android).
// AsyncStorage plano NO es válido para tokens de auth.
//
// En simulador iOS sin provisioning profile de Apple, Keychain falla con
// `KeyChainException: A required entitlement isn't present.` Para no
// bloquear el boot (la app queda en "loading" si getSession() rechaza),
// degradamos a AsyncStorage SOLO en simulador. En device real SecureStore
// funciona y se usa siempre.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';

const isSimulator = __DEV__ && Platform.OS === 'ios';

async function safeGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    if (isSimulator) {
      console.warn('[secureStore] Keychain no disponible en simulador, fallback AsyncStorage:', err);
      return AsyncStorage.getItem(`ss:${key}`);
    }
    throw err;
  }
}

async function safeSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    if (isSimulator) {
      console.warn('[secureStore] Keychain no disponible en simulador, fallback AsyncStorage:', err);
      await AsyncStorage.setItem(`ss:${key}`, value);
      return;
    }
    throw err;
  }
}

async function safeRemove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    if (isSimulator) {
      AsyncStorage.removeItem(`ss:${key}`).catch(() => {});
      return;
    }
    throw err;
  }
}

export const secureStoreAdapter: SupportedStorage = {
  getItem: (key: string) => safeGet(key),
  setItem: (key: string, value: string) => safeSet(key, value),
  removeItem: (key: string) => safeRemove(key),
};