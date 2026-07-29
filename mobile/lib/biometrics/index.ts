// Lock biométrico para la app. MVP: si el usuario ha habilitado el
// flag (default true), al volver del background tras >30s pide Face ID
// o huella antes de mostrar contenido.
//
// Por qué >30s y no cada vez que se vuelve al foreground: cambiar de
// app para mirar una notificación no debería forzar re-auth. Umbral
// corto = fricción innecesaria; umbral largo = seguridad floja. 30s
// es el sweet spot habitual para apps bancarias.
//
// Por qué NO bloqueamos también al iniciar la app: el login con
// Supabase ya requiere email+password y persiste sesión en SecureStore.
// Bloquear otra vez al cold start añade fricción sin valor — el
// atacante ya necesitaría acceso al SecureStore.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENABLED_KEY = 'biometric_lock_enabled';
const LAST_ACTIVE_KEY = 'last_active_at';

export async function isLockEnabled(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(ENABLED_KEY);
    // Default ON: el usuario debe ir a Perfil para desactivarlo.
    if (v === null) return true;
    return v === '1';
  } catch {
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, enabled ? '1' : '0');
}

export async function recordActiveNow(): Promise<void> {
  await SecureStore.setItemAsync(LAST_ACTIVE_KEY, Date.now().toString());
}

export async function secondsSinceLastActive(): Promise<number | null> {
  try {
    const v = await SecureStore.getItemAsync(LAST_ACTIVE_KEY);
    if (!v) return null;
    return Math.floor((Date.now() - Number(v)) / 1000);
  } catch {
    return null;
  }
}

export async function canUseBiometrics(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

// Combinado: si el lock está habilitado y han pasado >N segundos
// desde la última vez que estuvo activa, requiere auth.
export async function needsReauth(thresholdSec = 30): Promise<boolean> {
  const enabled = await isLockEnabled();
  if (!enabled) return false;
  const ok = await canUseBiometrics();
  if (!ok) return false;
  const since = await secondsSinceLastActive();
  if (since === null) return true;
  return since > thresholdSec;
}