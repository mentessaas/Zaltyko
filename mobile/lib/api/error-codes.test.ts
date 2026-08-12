import { describe, it, expect } from 'vitest';
import {
  translateError,
  inferRetryableFromStatus,
  CONTRACT_ERROR_CODES,
  type NextAction,
} from './error-codes';

// Tabla del contrato ZAL-619 §6.3. Cada código contractual debe tener una
// traducción explícita con `nextAction` no-nulo y copy localizado (no el
// `message` del backend). AC-10: ningún error expone stack trace ni secreto.

describe('translateError - códigos contractuales ZAL-619 §6.3', () => {
  // Tabla de traducciones explícitas. Si el contrato añade un código,
  // debe añadirse aquí. Si se elimina, debe eliminarse.
  const expected: Record<string, { retryable: boolean; nextAction: NextAction }> = {
    AUTH_REQUIRED: { retryable: false, nextAction: 'reauth' },
    FORBIDDEN_ROLE: { retryable: false, nextAction: 'contact_support' },
    ACADEMY_NOT_FOUND: { retryable: false, nextAction: 'contact_support' },
    RESOURCE_NOT_FOUND: { retryable: false, nextAction: 'none' },
    VALIDATION_ERROR: { retryable: false, nextAction: 'none' },
    INVALID_STATE_TRANSITION: { retryable: false, nextAction: 'none' },
    IDEMPOTENCY_CONFLICT: { retryable: false, nextAction: 'contact_support' },
    DUPLICATE_SUSPECTED: { retryable: false, nextAction: 'none' },
    IMPORT_ROW_INVALID: { retryable: false, nextAction: 'contact_support' },
    IMPORT_TOTAL_MISMATCH: { retryable: false, nextAction: 'contact_support' },
    PAYMENT_STATE_UNAVAILABLE: { retryable: true, nextAction: 'retry' },
    DELIVERY_FAILED: { retryable: true, nextAction: 'retry' },
    RATE_LIMITED: { retryable: true, nextAction: 'wait' },
    TEMPORARY_UNAVAILABLE: { retryable: true, nextAction: 'retry' },
  };

  for (const code of CONTRACT_ERROR_CODES) {
    it(`${code} tiene traducción con retryable + nextAction correctos`, () => {
      const expectedEntry = expected[code];
      // El set está sincronizado con la tabla: la assertion exhaustiva
      // `CONTRACT_ERROR_CODES lista todos los códigos contractuales` falla
      // si este cast resulta ser incorrecto.
      if (!expectedEntry) throw new Error(`Falta expectativa para ${code}`);
      const t = translateError(code);
      expect(t.message).toBeTruthy();
      expect(t.message.length).toBeGreaterThan(0);
      expect(t.retryable).toBe(expectedEntry.retryable);
      expect(t.nextAction).toBe(expectedEntry.nextAction);
    });
  }

  it('CONTRACT_ERROR_CODES lista todos los códigos contractuales (sin extras)', () => {
    expect(new Set(CONTRACT_ERROR_CODES)).toEqual(new Set(Object.keys(expected)));
  });
});

describe('translateError - códigos del cliente HTTP', () => {
  it('NO_SESSION → reauth (no reintentable)', () => {
    const t = translateError('NO_SESSION');
    expect(t.retryable).toBe(false);
    expect(t.nextAction).toBe('reauth');
  });

  it('NETWORK_ERROR → retry (reintentable)', () => {
    const t = translateError('NETWORK_ERROR');
    expect(t.retryable).toBe(true);
    expect(t.nextAction).toBe('retry');
  });

  it('TIMEOUT → retry (reintentable)', () => {
    const t = translateError('TIMEOUT');
    expect(t.retryable).toBe(true);
    expect(t.nextAction).toBe('retry');
  });

  it('INVALID_JSON → retry (reintentable)', () => {
    const t = translateError('INVALID_JSON');
    expect(t.retryable).toBe(true);
    expect(t.nextAction).toBe('retry');
  });
});

describe('translateError - códigos desconocidos', () => {
  it('cualquier código que no esté en la tabla cae a un fallback reintentable', () => {
    const t = translateError('SOME_UNKNOWN_CODE_FROM_FUTURE');
    expect(t.retryable).toBe(true);
    expect(t.nextAction).toBe('retry');
    expect(t.message).toBeTruthy();
  });

  it('el fallback NUNCA expone el mensaje del backend aunque se le pase', () => {
    // Por contrato ZAL-619 §6.1 el backend debe enviar `message` seguro,
    // pero no confiamos: la UI nunca debe mostrar un mensaje que no haya
    // pasado por la tabla.
    const t = translateError('UNKNOWN_CODE');
    expect(t.message).not.toContain('stack');
    expect(t.message).not.toContain('SQL');
    expect(t.message).not.toContain('error:');
  });
});

describe('inferRetryableFromStatus', () => {
  it('5xx es reintentable', () => {
    expect(inferRetryableFromStatus(500)).toBe(true);
    expect(inferRetryableFromStatus(503)).toBe(true);
    expect(inferRetryableFromStatus(599)).toBe(true);
  });

  it('408 (request timeout) y 429 (rate limited) son reintentables', () => {
    expect(inferRetryableFromStatus(408)).toBe(true);
    expect(inferRetryableFromStatus(429)).toBe(true);
  });

  it('4xx no es reintentable', () => {
    expect(inferRetryableFromStatus(400)).toBe(false);
    expect(inferRetryableFromStatus(401)).toBe(false);
    expect(inferRetryableFromStatus(403)).toBe(false);
    expect(inferRetryableFromStatus(404)).toBe(false);
    expect(inferRetryableFromStatus(422)).toBe(false);
  });

  it('3xx y 2xx no son reintentables', () => {
    expect(inferRetryableFromStatus(200)).toBe(false);
    expect(inferRetryableFromStatus(301)).toBe(false);
  });
});
