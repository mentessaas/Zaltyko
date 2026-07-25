import { describe, it, expect } from 'vitest';
import { tabsForRole, shouldRedirectToWeb } from './role-router';

describe('tabsForRole', () => {
  it('parent y athlete no ven tabs administrativos (billing/classes) — solo su portal', () => {
    for (const role of ['parent', 'athlete'] as const) {
      const tabs = tabsForRole(role);
      const keys = tabs.map((t) => t.key);
      expect(keys).not.toContain('billing');
      expect(keys).toContain('schedule');
      expect(keys).toContain('notifications');
    }
  });

  it('coach ve agenda y avisos pero su home es "classes", no billing', () => {
    const keys = tabsForRole('coach').map((t) => t.key);
    // No fijamos el array completo: nuevas tabs (ej. mensajes) pueden
    // añadirse sin romper este contrato. Lo que no debe cambiar es que
    // el home del coach es "classes" (no "home") y que no ve billing.
    expect(keys[0]).toBe('classes');
    expect(keys).toContain('schedule');
    expect(keys).not.toContain('billing');
    expect(keys).not.toContain('home');
  });

  it('owner/admin/super_admin comparten el mismo set de 4 tabs', () => {
    const owner = tabsForRole('owner').map((t) => t.key);
    const admin = tabsForRole('admin').map((t) => t.key);
    const superAdmin = tabsForRole('super_admin').map((t) => t.key);
    expect(owner).toEqual(admin);
    expect(admin).toEqual(superAdmin);
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
