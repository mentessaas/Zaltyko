// Decide qué tabs ve el usuario según su rol.
// Coincide con el portal limitado de CLAUDE.md: parent/athlete solo ven
// su información, no la admin. Coach ve lo suyo. Owner/admin ven todo.

import { capabilitiesForRole, isZaltykoRole, UNKNOWN_ROLE_FALLBACK, type ZaltykoRole } from './roles';

export type TabKey = 'home' | 'schedule' | 'messages' | 'notifications' | 'profile' | 'classes' | 'billing';

export interface TabConfig {
  key: TabKey;
  title: string;
  href: string;
  icon: string;
}

// Tabs visibles por rol. Una sola lista: la pantalla Home adapta su
// contenido según rol, pero las pestañas son siempre 5 para mantener
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
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  viewer: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'schedule', title: 'Agenda', href: '/(tabs)/schedule', icon: 'calendar' },
    { key: 'messages', title: 'Mensajes', href: '/(tabs)/messages', icon: 'message' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
  // provider (ZAL-768): shell "global" en el backend — sin academia,
  // sin familia, sin billing. Mobile NO es su superficie de trabajo,
  // así que no recibe Agenda (clases de academia) ni Mensajes
  // (mensajería tenant-scoped): solo avisos y perfil. La pantalla de
  // inicio se mantiene declarada porque el layout de tabs mapea
  // 'home' → la ruta `index` de Expo Router; su contenido para
  // provider lo define ZAL-427 con Producto/UX, no este contrato.
  provider: [
    { key: 'home', title: 'Inicio', href: '/(tabs)', icon: 'home' },
    { key: 'notifications', title: 'Avisos', href: '/(tabs)/notifications', icon: 'bell' },
    { key: 'profile', title: 'Perfil', href: '/(tabs)/profile', icon: 'user' },
  ],
};

export function tabsForRole(role: ZaltykoRole | undefined): TabConfig[] {
  if (!role) return TABS_BY_ROLE.parent; // sesión cargando: default seguro
  // Un rol que el backend manda pero mobile no conoce NO puede caer a
  // `parent`: eso le daría el portal de familia. Cae al rol de menor
  // privilegio (ver UNKNOWN_ROLE_FALLBACK en roles.ts).
  if (!isZaltykoRole(role)) return TABS_BY_ROLE[UNKNOWN_ROLE_FALLBACK];
  return TABS_BY_ROLE[role] ?? TABS_BY_ROLE[UNKNOWN_ROLE_FALLBACK];
}

// Para Fase 2: decidir si un rol debería ser redirigido a la web
// (admin con mucha superficie). En MVP, todo el mundo entra a la app.
export function shouldRedirectToWeb(role: ZaltykoRole | undefined): boolean {
  return false;
}

// Rutas internas reservadas a roles admin/coach. Mobile las monta
// como pantallas Expo Router pero NO las expone a través de las tabs
// de parent/athlete/viewer. Esta lista es la fuente de verdad para
// que un deep link (`expo-linking://coach/attendance/123`) no burle
// el filtro de tabs y muestre UI admin a un padre.
//
// AC-08 (ZAL-622 Fase 5): tests negativos verifican que un parent
// no llega a estas rutas. La defensa en backend es con `withTenant`
// + `verifyAcademyAccessForProfile`; aquí bloqueamos en cliente para
// no tener que esperar al 403 para redirigir.
const ADMIN_ROUTE_PREFIXES: readonly string[] = [
  '/coach/',            // pantallas de coach (asistencia, etc.)
  '/super-admin/',      // panel super-admin (si alguna vez se monta)
  '/(super-admin)/',    // variante con grupo de Expo Router
];

export function isAdminRoute(path: string): boolean {
  if (!path) return false;
  // Normalizamos para que '/coach/attendance/123' y 'coach/attendance/123'
  // caigan en la misma regla.
  const normalized = normalizePath(path);
  return ADMIN_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

// Rutas ligadas a una academia o a la familia. Un rol con shell
// "global" (hoy solo `provider`) no pertenece a ninguna academia, así
// que estas rutas no son "suyas" ni siquiera en modo lectura: el
// backend responderá 403 y, sin este filtro, un deep link
// (`zaltyko://family/invoices`) dejaría al proveedor mirando el portal
// de familia mientras el fetch falla.
const ACADEMY_SCOPED_ROUTE_PREFIXES: readonly string[] = [
  '/family/',            // portal de familia (hijos, facturas)
  '/(tabs)/schedule',    // agenda de clases de la academia
  '/(tabs)/messages',    // mensajería tenant-scoped
];

export function isAcademyScopedRoute(path: string): boolean {
  if (!path) return false;
  const normalized = normalizePath(path);
  return ACADEMY_SCOPED_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Decide si un rol puede navegar a una ruta interna. Usado por el
 * layout `(tabs)/_layout.tsx` para proteger deep links: si un padre
 * intenta abrir `/coach/attendance/...` vía deep link, devolvemos
 * `false` y el layout lo redirige a la pestaña "home".
 *
 * Roles admin (owner/admin/super_admin/coach) acceden a todo.
 * parent/athlete/viewer NO acceden a rutas admin/coach.
 * provider (shell "global", ZAL-768) además NO accede a rutas de
 * academia ni al portal de familia: solo avisos, perfil e inicio.
 */
export function canAccessRoute(
  role: ZaltykoRole | undefined,
  path: string,
): boolean {
  if (!role) return false;

  // Sin superficie de trabajo en mobile (provider): deny-list amplia.
  // Se decide por capacidad, no por igualdad de string, para que un
  // futuro rol "global" herede el mismo aislamiento sin tocar esto.
  if (!capabilitiesForRole(role).hasMobileWorkSurface) {
    return !isAdminRoute(path) && !isAcademyScopedRoute(path);
  }

  if (!isAdminRoute(path)) return true;
  return (
    role === 'super_admin' ||
    role === 'owner' ||
    role === 'admin' ||
    role === 'coach'
  );
}
