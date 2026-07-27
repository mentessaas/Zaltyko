// Flag de "ya vio la bienvenida", una vez por dispositivo. AsyncStorage
// (no SecureStore): no es un dato sensible, solo una preferencia de UI.

import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = 'welcome_seen_v1';

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    return true; // si falla la lectura, no bloquear al usuario con la bienvenida
  }
}

export async function markWelcomeSeen(): Promise<void> {
  await AsyncStorage.setItem(SEEN_KEY, '1');
}
