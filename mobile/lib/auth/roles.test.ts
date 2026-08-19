// Contrato de roles (ZAL-768). El foco son los casos negativos: qué
// NO puede pasar. El bug que estos tests bloquean es concreto — antes
// de este contrato un perfil con role "provider" llegaba de /api/me,
// no coincidía con ningún ZaltykoRole y caía al fallback `parent` del
// role-router, mostrando el portal de familia a un proveedor.

import { describe, it, expect } from 'vitest';
import {
  ZALTYKO_ROLES,
  UNKNOWN_ROLE_FALLBACK,
  isZaltykoRole,
  normalizeRole,
  normalizeMeProfile,
  capabilitiesForRole,
  ROLE_CAPABILITIES,
} from './roles';

describe('ZALTYKO_ROLES', () => {
  it('incluye provider como rol de primera clase', () => {
    expect(ZALTYKO_ROLES).toContain('provider');
  });

  it('cubre todos los ProfileRole del backend (src/lib/product/roles.ts)', () => {
    // Espejo literal del type ProfileRole del backend. Si el backend
    // añade un rol y mobile no, este test falla antes de que un
    // usuario real caiga en el fallback.
    const backendProfileRoles = [
      'super_admin',
      'admin',
      'owner',
      'coach',
      'athlete',
      'parent',
      'provider',
    ] as const;
    for (const role of backendProfileRoles) {
      expect(ZALTYKO_ROLES).toContain(role);
    }
  });

  it('cada rol declarado tiene capacidades declaradas', () => {
    for (const role of ZALTYKO_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined();
    }
  });
});

describe('isZaltykoRole', () => {
  it.each([...ZALTYKO_ROLES])('reconoce %s', (role) => {
    expect(isZaltykoRole(role)).toBe(true);
  });

  it.each([
    'marketplace_admin',
    'PROVIDER',
    'provider ',
    '',
    'undefined',
    'null',
  ])('rechaza el string %o', (value) => {
    expect(isZaltykoRole(value)).toBe(false);
  });

  it.each([null, undefined, 0, 1, {}, [], true])('rechaza el no-string %o', (value) => {
    expect(isZaltykoRole(value)).toBe(false);
  });
});

describe('normalizeRole — fallback seguro', () => {
  it('un rol desconocido NUNCA cae a parent (no expone el portal de familia)', () => {
    expect(normalizeRole('rol_que_no_existe')).not.toBe('parent');
    expect(normalizeRole('rol_que_no_existe')).toBe(UNKNOWN_ROLE_FALLBACK);
  });

  it('un rol desconocido NUNCA cae a un rol admin', () => {
    for (const value of ['rol_raro', null, undefined, 42]) {
      const normalized = normalizeRole(value);
      expect(['super_admin', 'owner', 'admin', 'coach']).not.toContain(normalized);
    }
  });

  it('el fallback es un rol sin workspace de academia ni billing', () => {
    const caps = ROLE_CAPABILITIES[UNKNOWN_ROLE_FALLBACK];
    expect(caps.canAccessAcademyWorkspace).toBe(false);
    expect(caps.canSeeBilling).toBe(false);
    expect(caps.canManageAcademies).toBe(false);
  });

  it('preserva provider tal cual, sin degradarlo', () => {
    expect(normalizeRole('provider')).toBe('provider');
  });
});

describe('normalizeMeProfile — perfil de /api/me', () => {
  const base = {
    id: 'p-1',
    email: 'proveedor@example.com',
  };

  it('acepta un perfil provider real del backend', () => {
    const profile = normalizeMeProfile({
      ...base,
      fullName: 'Proveedora Uno',
      role: 'provider',
      academyId: null,
      academyName: null,
    });
    expect(profile.role).toBe('provider');
    expect(profile.academyId).toBeNull();
  });

  it('provider sin academia sigue sin academia (no se inventa tenant)', () => {
    const profile = normalizeMeProfile({ ...base, role: 'provider' });
    expect(profile.academyId).toBeNull();
    expect(profile.academyName).toBeNull();
  });

  it('role ausente o null degrada al fallback, no a parent', () => {
    expect(normalizeMeProfile({ ...base }).role).toBe(UNKNOWN_ROLE_FALLBACK);
    expect(normalizeMeProfile({ ...base, role: null }).role).toBe(UNKNOWN_ROLE_FALLBACK);
    expect(normalizeMeProfile({ ...base, role: null }).role).not.toBe('parent');
  });

  it('normaliza fullName undefined a null (el resto de la app espera null)', () => {
    expect(normalizeMeProfile({ ...base, role: 'provider' }).fullName).toBeNull();
  });
});

describe('capabilitiesForRole — provider espeja el backend', () => {
  it('provider tiene shell global, sin academia, sin equipo, sin billing', () => {
    const caps = capabilitiesForRole('provider');
    expect(caps.shell).toBe('global');
    expect(caps.canAccessAcademyWorkspace).toBe(false);
    expect(caps.canManageAcademies).toBe(false);
    expect(caps.canManageTeam).toBe(false);
    expect(caps.canSeeBilling).toBe(false);
  });

  it('provider es el único rol sin superficie de trabajo en mobile', () => {
    const sinSuperficie = ZALTYKO_ROLES.filter(
      (role) => !ROLE_CAPABILITIES[role].hasMobileWorkSurface
    );
    expect(sinSuperficie).toEqual(['provider']);
  });

  it('rol undefined (sesión cargando) devuelve el fallback, no capacidades admin', () => {
    const caps = capabilitiesForRole(undefined);
    expect(caps.canAccessAcademyWorkspace).toBe(false);
    expect(caps.canManageAcademies).toBe(false);
  });
});
