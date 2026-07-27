// Re-exporta desde SessionProvider para no tener que tocar los ~12
// imports existentes de '@/lib/auth/use-session' al centralizar la
// sesión en un Context (ver SessionProvider.tsx para la lógica real).

export { useSession, type ZaltykoRole, type ZaltykoProfile, type SessionState } from './SessionProvider';
