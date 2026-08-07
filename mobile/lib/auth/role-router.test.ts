import { describe, it, expect } from 'vitest';
import { tabsForRole, shouldRedirectToWeb } from './role-router';

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
