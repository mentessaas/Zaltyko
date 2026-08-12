import { describe, it, expect } from 'vitest';
import {
  tabsForRole,
  shouldRedirectToWeb,
  isAdminRoute,
  canAccessRoute,
} from './role-router';

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
