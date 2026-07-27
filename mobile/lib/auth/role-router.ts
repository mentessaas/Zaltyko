// Decide qué tabs ve el usuario según su rol.
// Coincide con el portal limitado de CLAUDE.md: parent/athlete solo ven
// su información, no la admin. Coach ve lo suyo. Owner/admin ven todo.

import type { ZaltykoRole } from './use-session';

export type TabKey = 'home' | 'schedule' | 'messages' | 'notifications' | 'profile' | 'classes' | 'billing';

export interface TabConfig {
  key: TabKey;
  title: string;
  href: string;
  icon: string;
}

// Tabs visibles por rol. Una sola lista: la pantalla Home adapta su
// contenido según rol, pero las pestañas son siempre 4 para mantener
// coherencia visual y reducir complejidad de navegación.
const TABS_BY_ROLE: Record<ZaltykoRole, TabConfig[]> = {
  super_admin: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  owner: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  admin: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  coach: [
    { key: 'classes', title: 'Mis clases', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  parent: [
    { key: 'home', title: 'Mis hijos', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  athlete: [
    { key: 'home', title: 'Mi perfil', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Ajustes', href: '/(tabs)/profile', icon: 'user' },
  ],
  viewer: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
};

export function tabsForRole(role: ZaltykoRole | undefined): TabConfig[] {
  if (!role) return TABS_BY_ROLE.parent; // default seguro
  return TABS_BY_ROLE[role] ?? TABS_BY_ROLE.parent;
}

// Para Fase 2: decidir si un rol debería ser redirigido a la web
// (admin con mucha superficie). En MVP, todo el mundo entra a la app.
export function shouldRedirectToWeb(role: ZaltykoRole | undefined): boolean {
  return false;
}