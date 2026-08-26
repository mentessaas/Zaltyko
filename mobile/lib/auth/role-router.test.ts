import { describe, it, expect } from 'vitest';
<<<<<<< HEAD
import {
  tabsForRole,
  shouldRedirectToWeb,
  isAdminRoute,
  isAcademyScopedRoute,
  canAccessRoute,
} from './role-router';
=======
import { tabsForRole, shouldRedirectToWeb } from './role-router';
>>>>>>> origin/main

describe('tabsForRole', () => {
  it.each([
    ['super_admin', ['home', 'schedule', 'messages', 'notifications', 'profile']],
    ['owner', ['home', 'schedule', 'messages', 'notifications', 'profile']],
    ['admin', ['home', 'schedule', 'messages', 'notifications', 'profile']],
    ['coach', ['classes', 'schedule', 'messages', 'notifications', 'profile']],
    ['parent', ['home', 'schedule', 'messages', 'notifications', 'profile']],
    ['athlete', ['home', 'schedule', 'messages', 'notifications', 'profile']],
    ['viewer', ['home', 'schedule', 'messages', 'notifications', 'profile']],
  ] as const)('%s ve exactamente sus tabs permitidas', (role, expectedKeys) => {
    expect(tabsForRole(role).map((tab) => tab.key)).toEqual(expectedKeys);
  });

  it('sin rol (undefined) cae a parent como default seguro, no a un rol admin', () => {
    const tabs = tabsForRole(undefined);
    expect(tabs).toEqual(tabsForRole('parent'));
  });

  it('todas las agendas y avisos apuntan a las mismas rutas de tabs, sin importar el rol', () => {
    const roles = ['super_admin', 'owner', 'admin', 'coach', 'parent', 'athlete', 'viewer'] as const;
    for (const role of roles) {
      const tabs = tabsForRole(role);
      const schedule = tabs.find((t) => t.key === 'schedule');
      const notifications = tabs.find((t) => t.key === 'notifications');
      expect(schedule?.href).toBe('/(tabs)/schedule');
      expect(notifications?.href).toBe('/(tabs)/notifications');
    }
  });
});

describe('shouldRedirectToWeb', () => {
  it('MVP: ningún rol se redirige a la web todavía', () => {
    expect(shouldRedirectToWeb('admin')).toBe(false);
    expect(shouldRedirectToWeb(undefined)).toBe(false);
  });
});
<<<<<<< HEAD

describe('isAdminRoute', () => {
  it.each([
    ['/coach/attendance/123', true],
    ['/coach/attendance/abc-def', true],
    ['/super-admin/users', true],
    ['/(super-admin)/users', true],
    ['/(tabs)/schedule', false],
    ['/(tabs)/messages', false],
    ['/family/invoices', false],
    ['/family/child/uuid', false],
    ['/profile/legal', false],
    ['', false],
  ] as const)('%s es admin=%s', (path, expected) => {
    expect(isAdminRoute(path)).toBe(expected);
  });

  it('normaliza rutas sin slash inicial', () => {
    expect(isAdminRoute('coach/attendance/123')).toBe(true);
    expect(isAdminRoute('(tabs)/schedule')).toBe(false);
  });
});

// AC-08 (ZAL-622 Fase 5): parent/athlete/viewer NO deben poder
// navegar a rutas admin/coach vía deep link. La defensa es doble:
// backend (withTenant + verifyAcademyAccessForProfile) + cliente
// (este helper). Estos tests bloquean cualquier intento de revertir
// el aislamiento (mismo patrón de bug que el de permisos-service.ts
// del backend, julio 2026 — escalada de privilegios cross-tenant).
describe('canAccessRoute — aislamiento parent/athlete/viewer (AC-08)', () => {
  it.each([
    '/coach/attendance/abc-123',
    '/coach/attendance/some-uuid',
    '/super-admin/users',
    '/(super-admin)/dashboard',
  ] as const)('parent NO accede a %s', (path) => {
    expect(canAccessRoute('parent', path)).toBe(false);
  });

  it.each([
    '/coach/attendance/abc-123',
    '/super-admin/users',
  ] as const)('athlete NO accede a %s', (path) => {
    expect(canAccessRoute('athlete', path)).toBe(false);
  });

  it.each([
    '/coach/attendance/abc-123',
    '/super-admin/users',
  ] as const)('viewer NO accede a %s', (path) => {
    expect(canAccessRoute('viewer', path)).toBe(false);
  });

  it('rol undefined (cargando) NUNCA accede a admin/coach', () => {
    expect(canAccessRoute(undefined, '/coach/attendance/x')).toBe(false);
    expect(canAccessRoute(undefined, '/super-admin/users')).toBe(false);
  });

  it('roles admin SÍ acceden a rutas admin/coach', () => {
    expect(canAccessRoute('super_admin', '/super-admin/users')).toBe(true);
    expect(canAccessRoute('owner', '/coach/attendance/x')).toBe(true);
    expect(canAccessRoute('admin', '/coach/attendance/x')).toBe(true);
    expect(canAccessRoute('coach', '/coach/attendance/x')).toBe(true);
  });

  it.each([
    '/(tabs)/schedule',
    '/(tabs)/messages',
    '/(tabs)/notifications',
    '/(tabs)/profile',
    '/family/invoices',
    '/family/child/uuid',
    '/profile/legal',
  ] as const)('parent SÍ accede a %s (no es admin)', (path) => {
    expect(canAccessRoute('parent', path)).toBe(true);
  });

  it.each([
    '/(tabs)/schedule',
    '/family/invoices',
    '/family/child/uuid',
  ] as const)('athlete SÍ accede a %s (no es admin)', (path) => {
    expect(canAccessRoute('athlete', path)).toBe(true);
  });
});

// ZAL-768: contrato del rol `provider` en mobile. El backend le da
// shell "global" (sin academia, sin billing) y mobile no es su
// superficie de trabajo. Estos tests son el gate contra la regresión
// concreta que existía: provider caía al fallback `parent` y veía el
// portal de familia.
describe('provider — tabs (ZAL-768)', () => {
  it('NO recibe las tabs de parent (era el bug: fallback al portal de familia)', () => {
    expect(tabsForRole('provider')).not.toEqual(tabsForRole('parent'));
  });

  it('solo ve inicio, avisos y perfil', () => {
    expect(tabsForRole('provider').map((tab) => tab.key)).toEqual([
      'home',
      'notifications',
      'profile',
    ]);
  });

  it.each(['schedule', 'messages', 'classes', 'billing'] as const)(
    'NO ve la tab %s (superficie de academia)',
    (key) => {
      expect(tabsForRole('provider').map((tab) => tab.key)).not.toContain(key);
    }
  );

  it('ninguna tab de provider apunta a Marketplace ni a productos', () => {
    for (const tab of tabsForRole('provider')) {
      expect(tab.href).not.toMatch(/marketplace|producto/i);
      expect(tab.title).not.toMatch(/marketplace|producto/i);
    }
  });
});

describe('tabsForRole — fallback de rol desconocido (ZAL-768)', () => {
  it('un rol que el backend manda y mobile no conoce NO recibe tabs de parent', () => {
    // Cast deliberado: simula exactamente lo que pasaba con "provider"
    // antes de declararlo — un string que no es ZaltykoRole.
    const tabs = tabsForRole('marketplace_admin' as never);
    expect(tabs).not.toEqual(tabsForRole('parent'));
    expect(tabs).toEqual(tabsForRole('viewer'));
  });

  it('sigue cayendo a parent solo cuando el rol es undefined (sesión cargando)', () => {
    expect(tabsForRole(undefined)).toEqual(tabsForRole('parent'));
  });
});

describe('isAcademyScopedRoute (ZAL-768)', () => {
  it.each([
    ['/family/invoices', true],
    ['/family/child/uuid', true],
    ['/(tabs)/schedule', true],
    ['/(tabs)/messages', true],
    ['/(tabs)/notifications', false],
    ['/(tabs)/profile', false],
    ['/profile/legal', false],
    ['', false],
  ] as const)('%s es academy-scoped=%s', (path, expected) => {
    expect(isAcademyScopedRoute(path)).toBe(expected);
  });

  it('normaliza rutas sin slash inicial', () => {
    expect(isAcademyScopedRoute('family/invoices')).toBe(true);
  });
});

describe('canAccessRoute — aislamiento de provider (ZAL-768)', () => {
  it.each([
    '/family/invoices',
    '/family/child/abc-123',
    '/(tabs)/schedule',
    '/(tabs)/messages',
  ] as const)('provider NO accede a %s (ruta de academia/familia)', (path) => {
    expect(canAccessRoute('provider', path)).toBe(false);
  });

  it.each([
    '/coach/attendance/abc-123',
    '/super-admin/users',
    '/(super-admin)/dashboard',
  ] as const)('provider NO accede a %s (ruta admin)', (path) => {
    expect(canAccessRoute('provider', path)).toBe(false);
  });

  it.each([
    '/(tabs)',
    '/(tabs)/notifications',
    '/(tabs)/profile',
    '/profile/legal',
  ] as const)('provider SÍ accede a %s (avisos/perfil)', (path) => {
    expect(canAccessRoute('provider', path)).toBe(true);
  });

  it('el aislamiento de provider no recorta a parent ni a athlete', () => {
    // Guard de regresión: la deny-list es por capacidad
    // (hasMobileWorkSurface), no global.
    expect(canAccessRoute('parent', '/family/invoices')).toBe(true);
    expect(canAccessRoute('athlete', '/(tabs)/schedule')).toBe(true);
    expect(canAccessRoute('coach', '/coach/attendance/x')).toBe(true);
  });
});
=======
>>>>>>> origin/main
