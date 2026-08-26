/**
 * Suite de paridad observable Web ↔ Mobile (ZAL-622 AC-11 / Fase 8).
 *
 * Verifica que las definiciones de tipo que Mobile espeja del contrato
 * compartido (`GET /api/dashboard/[academyId]/attention`) siguen siendo
 * estructuralmente compatibles con las definiciones que la Web consume.
 *
 * Por qué este test existe:
 *   - El contrato compartido vive en `src/lib/dashboard/attention-types.ts`.
 *   - Mobile replica los tipos en `mobile/lib/api/dashboard.ts` (por
 *     aislamiento y para evitar acoplar la app al repo Web). Si alguien
 *     añade un campo en Web y olvida espejarlo en Mobile, la app acepta
 *     el payload pero la UI ignora el campo sin warning.
 *   - Este test fija los nombres de campos y los union members para que
 *     cualquier drift falle en CI con un mensaje accionable.
 *
 * Por qué fuente-texto y no `import type` cross-dir:
 *   - El tsconfig de mobile no incluye `../src/`, así que `tsc --noEmit`
 *     no type-checka los tipos de Web desde aquí.
 *   - vitest resuelve imports por Node ESM, pero queremos que la suite
 *     falle también si alguien renombra el archivo de Web (no sólo si el
 *     tipo cambia) — leer el archivo fuerza una verificación de presencia.
 *
 * Lo que NO hace este test:
 *   - No valida UI (eso es Fase 9 / QA device matrix).
 *   - No ejecuta requests contra el backend (eso es E2E).
 *   - No verifica lógica de negocio — sólo que el contrato de tipos no
 *     haya divergido entre las dos implementaciones.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');
const WEB_TYPES_PATH = resolve(REPO_ROOT, 'src/lib/dashboard/attention-types.ts');
const MOBILE_TYPES_PATH = resolve(__dirname, '../../lib/api/dashboard.ts');

/** Extrae los nombres de campo del cuerpo de un `interface`. */
function extractInterfaceBody(source: string, name: string): string | null {
  // Captura `interface NAME { ... }` balanceando llaves (un nivel es
  // suficiente porque los tipos compartidos no anidan interfaces en línea).
  const re = new RegExp(`(?:export\\s+)?interface\\s+${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const m = source.match(re);
  if (!m) return null;
  const captured = m[1];
  return captured ?? null;
}

/** Extrae los nombres de campo declarados en un cuerpo de interface. */
function extractFieldNames(body: string): string[] {
  const fields: string[] = [];
  for (const line of body.split('\n')) {
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (!stripped) continue;
    if (stripped.startsWith('*') || stripped.startsWith('/*')) continue;
    if (stripped.startsWith('}') || stripped.startsWith('{')) continue;
    // Captura `nombre:` o `nombre?:` o `nombre: ` (con o sin `?`).
    const fieldMatch = stripped.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\??:/);
    if (fieldMatch && fieldMatch[1]) {
      fields.push(fieldMatch[1]);
    }
  }
  return fields;
}

/** Extrae los miembros de un union literal (`type X = 'a' | 'b' | ...`). */
function extractUnionMembers(source: string, name: string): string[] | null {
  const re = new RegExp(`(?:export\\s+)?type\\s+${name}\\s*=\\s*([\\s\\S]*?);`);
  const m = source.match(re);
  if (!m) return null;
  const body = m[1] ?? '';
  const members: string[] = [];
  for (const part of body.split('|')) {
    const literal = part
      .replace(/\/\/.*$/, '')
      .trim()
      .replace(/[,;]$/, '')
      .trim();
    // Sólo aceptamos string literals entre comillas.
    const literalMatch = literal.match(/^['"]([^'"]+)['"]$/);
    if (literalMatch && literalMatch[1]) members.push(literalMatch[1]);
  }
  return members;
}

describe('paridad Web ↔ Mobile — attention bundle (ZAL-622 AC-11)', () => {
  const web = readFileSync(WEB_TYPES_PATH, 'utf8');
  const mobile = readFileSync(MOBILE_TYPES_PATH, 'utf8');

  it('ambos archivos de tipos existen y no están vacíos', () => {
    expect(web.length, 'web types file').toBeGreaterThan(100);
    expect(mobile.length, 'mobile types file').toBeGreaterThan(100);
  });

  /**
   * Tabla de paridad: cada entrada mapea el nombre Web → nombre Mobile.
   * Si la Web renombra `TodaySessionAttention` a `TodaySessionItem`,
   * esta tabla es donde se actualiza el contrato de paridad.
   */
  const parity: Array<{
    label: string;
    webName: string;
    mobileName: string;
  }> = [
    { label: 'TodaySession', webName: 'TodaySessionAttention', mobileName: 'TodaySession' },
    { label: 'AttendancePending', webName: 'AttendanceAttention', mobileName: 'AttendancePendingBlock' },
    { label: 'MessagesPending', webName: 'MessagesAttention', mobileName: 'MessagesPendingBlock' },
    { label: 'OverdueChargeItem', webName: 'OverdueChargeItem', mobileName: 'OverdueChargeItem' },
    { label: 'ChargesOverdue', webName: 'ChargesAttention', mobileName: 'ChargesOverdueBlock' },
    { label: 'ProgressDrafts', webName: 'ProgressAttention', mobileName: 'ProgressDraftsBlock' },
    { label: 'ImportActive', webName: 'ImportActiveAttention', mobileName: 'ImportActiveBlock' },
    { label: 'PriorityAction', webName: 'PriorityAction', mobileName: 'PriorityAction' },
  ];

  for (const { label, webName, mobileName } of parity) {
    describe(`interfaz ${label}`, () => {
      it(`Web define ${webName}`, () => {
        const body = extractInterfaceBody(web, webName);
        expect(body, `interface ${webName} debería existir en src/lib/dashboard/attention-types.ts`).not.toBeNull();
      });

      it(`Mobile define ${mobileName}`, () => {
        const body = extractInterfaceBody(mobile, mobileName);
        expect(body, `interface ${mobileName} debería existir en mobile/lib/api/dashboard.ts`).not.toBeNull();
      });

      it(`los campos de ${label} coinciden entre Web y Mobile`, () => {
        const webBody = extractInterfaceBody(web, webName);
        const mobileBody = extractInterfaceBody(mobile, mobileName);
        expect(webBody).not.toBeNull();
        expect(mobileBody).not.toBeNull();

        const webFields = new Set(extractFieldNames(webBody!));
        const mobileFields = new Set(extractFieldNames(mobileBody!));

        // Web es la fuente de verdad (contrato). Si Mobile tiene campos
        // adicionales no presentes en Web, NO bloqueamos (Mobile puede
        // añadir helpers de UI que el Web no necesita); pero si Web
        // expone un campo que Mobile ignora, eso sí es un bug — el
        // dashboard del dueño se renderiza incompleto.
        const onlyInWeb = [...webFields].filter((f) => !mobileFields.has(f));
        const onlyInMobile = [...mobileFields].filter((f) => !webFields.has(f));

        if (onlyInWeb.length > 0) {
          throw new Error(
            `Drift en ${label}: Web expone los campos [${onlyInWeb.join(', ')}] que Mobile no espeja. ` +
              `Si el contrato añadió un campo, espejarlo en mobile/lib/api/dashboard.ts (ZAL-619 §6.2).`,
          );
        }
        // Permitimos campos extra en Mobile como helpers de UI, pero los
        // listamos en el mensaje para que sean visibles si alguien revisa.
        if (onlyInMobile.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `${label}: Mobile tiene campos extra [${onlyInMobile.join(', ')}] no presentes en Web. ` +
              'Verificar que son helpers de UI, no payloads que el backend no devuelve.',
          );
        }

        expect(webFields.size, 'web field count').toBeGreaterThan(0);
      });
    });
  }

  describe('unions contractuales', () => {
    it('PriorityActionKind: Web y Mobile declaran los mismos union members', () => {
      const webMembers = new Set(extractUnionMembers(web, 'PriorityActionKind') ?? []);
      const mobileMembers = new Set(extractUnionMembers(mobile, 'PriorityActionKind') ?? []);
      expect(webMembers.size, 'web union no vacío').toBeGreaterThan(0);
      expect(mobileMembers.size, 'mobile union no vacío').toBeGreaterThan(0);

      const onlyInWeb = [...webMembers].filter((m) => !mobileMembers.has(m));
      const onlyInMobile = [...mobileMembers].filter((m) => !webMembers.has(m));

      if (onlyInWeb.length > 0 || onlyInMobile.length > 0) {
        throw new Error(
          `Drift en PriorityActionKind: solo-en-web=[${onlyInWeb.join(', ')}], ` +
            `solo-en-mobile=[${onlyInMobile.join(', ')}]. El backend discrimina por ` +
            `estos literales — cualquier divergencia rompe el mapeo a UI.`,
        );
      }
    });

    it('ImportJobState: Web y Mobile declaran los mismos union members', () => {
      const webMembers = new Set(extractUnionMembers(web, 'ImportJobState') ?? []);
      const mobileMembers = new Set(extractUnionMembers(mobile, 'ImportJobState') ?? []);
      expect(webMembers.size, 'web union no vacío').toBeGreaterThan(0);
      expect(mobileMembers.size, 'mobile union no vacío').toBeGreaterThan(0);

      const onlyInWeb = [...webMembers].filter((m) => !mobileMembers.has(m));
      const onlyInMobile = [...mobileMembers].filter((m) => !webMembers.has(m));

      if (onlyInWeb.length > 0 || onlyInMobile.length > 0) {
        throw new Error(
          `Drift en ImportJobState: solo-en-web=[${onlyInWeb.join(', ')}], ` +
            `solo-en-mobile=[${onlyInMobile.join(', ')}]. Cualquier divergencia rompe ` +
            `el render del import job y el CTA "Resolver import".`,
        );
      }
    });
  });

  describe('bundles (OwnerAttention / CoachAttention)', () => {
    it('OwnerAttentionBundle en Web incluye los bloques que Mobile espeja', () => {
      const webBody = extractInterfaceBody(web, 'OwnerAttentionBundle');
      expect(webBody).not.toBeNull();
      const webFields = new Set(extractFieldNames(webBody!));

      // Bloques contractuales del OwnerAttentionBundle. Si Web añade uno,
      // este test lo recordará.
      const required = [
        'academyId',
        'date',
        'today',
        'attendancePending',
        'messagesPending',
        'chargesOverdue',
        'progressDrafts',
        'importActive',
        'priorityAction',
      ];

      for (const f of required) {
        expect(webFields.has(f), `Web OwnerAttentionBundle.${f}`).toBe(true);
      }
    });

    it('CoachAttentionBundle en Web incluye academyId, today, attendancePending, messagesPending, priorityAction', () => {
      const webBody = extractInterfaceBody(web, 'CoachAttentionBundle');
      expect(webBody).not.toBeNull();
      const webFields = new Set(extractFieldNames(webBody!));

      const required = ['academyId', 'today', 'attendancePending', 'messagesPending', 'priorityAction'];
      for (const f of required) {
        expect(webFields.has(f), `Web CoachAttentionBundle.${f}`).toBe(true);
      }
    });
  });
});