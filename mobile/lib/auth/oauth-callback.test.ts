import { describe, it, expect } from 'vitest';

import { parseOAuthCallback } from './oauth-callback';

describe('parseOAuthCallback', () => {
  it('extrae el code PKCE del deep link zaltyko://auth/callback?code=...', () => {
    const url = 'zaltyko://auth/callback?code=abc123';
    expect(parseOAuthCallback(url)).toEqual({ code: 'abc123', error: undefined });
  });

  it('extrae code aunque venga con otros parámetros de Supabase', () => {
    // Supabase a veces añade state, scope, etc. Solo nos importa code.
    const url =
      'zaltyko://auth/callback?scope=email+profile&state=xyz&code=pkce-code-789';
    expect(parseOAuthCallback(url).code).toBe('pkce-code-789');
  });

  it('extrae error_description cuando Supabase rechaza el callback', () => {
    const url =
      'zaltyko://auth/callback?error=access_denied&error_description=El+usuario+cancelo+el+acceso';
    expect(parseOAuthCallback(url)).toEqual({
      code: undefined,
      error: 'El usuario cancelo el acceso',
    });
  });

  it('acepta el parámetro "error" como fallback de error_description', () => {
    const url = 'zaltyko://auth/callback?error=invalid_request';
    expect(parseOAuthCallback(url).error).toBe('invalid_request');
    expect(parseOAuthCallback(url).code).toBeUndefined();
  });

  it('devuelve { code: undefined, error: undefined } si falta code y error', () => {
    // URL bien formada pero sin code ni error: no debería pasar en
    // producción (Supabase siempre pone uno u otro), pero ser defensivos.
    const url = 'zaltyko://auth/callback?scope=email';
    expect(parseOAuthCallback(url)).toEqual({
      code: undefined,
      error: undefined,
    });
  });

  it('maneja URLs inválidas sin lanzar', () => {
    expect(parseOAuthCallback('not a url')).toEqual({
      error: 'URL de callback inválida',
    });
    expect(parseOAuthCallback('')).toEqual({
      error: 'URL de callback inválida',
    });
  });

  it('decodifica el + como espacio en error_description (form-urlencoded)', () => {
    const url =
      'zaltyko://auth/callback?error_description=Email+no+verificado+por+Google';
    expect(parseOAuthCallback(url).error).toBe(
      'Email no verificado por Google'
    );
  });
});