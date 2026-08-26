import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFamilyChildren,
  getUpcomingEvents,
  getSessions,
  getClassSession,
  getNotifications,
  getConversations,
  getConversationMessages,
  getMyProgress,
  getChargePayUrl,
  getInvitationPreview,
  createAssessment,
  deleteMyAccount,
  getSessionAttendance,
  sendGroupAlert,
<<<<<<< HEAD
  upsertAttendance,
  CHARGE_STATUSES,
  CHARGE_STATUS_LABEL,
  isChargePayable,
} from './endpoints';
import { ApiClientError } from './client';
import { getMyDashboard } from './family-dashboard';
=======
} from './endpoints';
>>>>>>> origin/main

// endpoints.ts es la frontera de contrato con el backend: define qué ruta
// se llama, cómo se arma el query-string y cómo se desenvuelve la respuesta.
// Varios endpoints NO devuelven el shape estándar { data } — devuelven
// { children }, { item }, { items } o { items, pagination }. Si el backend
// renombra una clave o alguien "normaliza" un wrapper aquí, typecheck no lo
// detecta (el genérico es una aserción, no una validación en runtime) y la
// pantalla se rompe con undefined. Estos tests fijan ese contrato.
//
// Se ejercita el cliente HTTP real con fetch mockeado, no un mock de
// apiGet/apiPost: así también se cubre el desempaquetado de apiSuccess.

const { getSessionMock, refreshSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock, refreshSession: refreshSessionMock },
  },
  API_BASE: 'https://app.zaltyko.test',
}));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Mockea fetch con una única respuesta y devuelve el mock para inspeccionar la URL llamada. */
function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const calledUrl = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls[0]![0] as string;

const calledInit = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls[0]![1] as RequestInit & { headers: Record<string, string> };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: 'valid-token' } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desempaquetado de respuestas no estándar', () => {
  it('getFamilyChildren devuelve el array de { children }, no el wrapper', async () => {
    const fetchMock = stubFetch({ children: [{ id: 'c1', name: 'Lucía' }] });

    await expect(getFamilyChildren()).resolves.toEqual([{ id: 'c1', name: 'Lucía' }]);
    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/family/children');
  });

  it('getClassSession devuelve el objeto de { item }, no el wrapper', async () => {
    stubFetch({ item: { id: 's1', classId: 'cl1', sessionDate: '2026-08-03' } });

    const session = await getClassSession('s1');

    expect(session.id).toBe('s1');
    expect(session).not.toHaveProperty('item');
  });

  it('getNotifications devuelve el array de { items }', async () => {
    stubFetch({ items: [{ id: 'n1', title: 'Clase cancelada', read: false }] });

    await expect(getNotifications()).resolves.toHaveLength(1);
  });

  it('getConversations devuelve el array de { items }', async () => {
    stubFetch({ items: [{ id: 'conv1', unreadCount: 2 }] });

    const conversations = await getConversations();

    expect(conversations[0]!.id).toBe('conv1');
  });

  it('getConversationMessages aplana pagination en hasMore/nextCursor', async () => {
    stubFetch({
      items: [{ id: 'm1', content: 'hola' }],
      pagination: { hasMore: true, nextCursor: 'cur-2' },
    });

    const page = await getConversationMessages('conv1');

    expect(page).toEqual({
      items: [{ id: 'm1', content: 'hola' }],
      hasMore: true,
      nextCursor: 'cur-2',
    });
  });

  it('getChargePayUrl devuelve la URL suelta, no el objeto { url }', async () => {
    stubFetch({ ok: true, data: { url: 'https://app.zaltyko.test/pay/ch1' } });

    await expect(getChargePayUrl('ch1')).resolves.toBe('https://app.zaltyko.test/pay/ch1');
  });
});

describe('construcción de query-string', () => {
  it('getUpcomingEvents sin params no deja un "?" colgando en la URL', async () => {
    const fetchMock = stubFetch({ ok: true, data: [] });

    await getUpcomingEvents();

    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/me/events');
  });

  it('getUpcomingEvents con rango de fechas los manda ambos', async () => {
    const fetchMock = stubFetch({ ok: true, data: [] });

    await getUpcomingEvents({ startDate: '2026-08-01', endDate: '2026-08-31' });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe('/api/me/events');
    expect(url.searchParams.get('startDate')).toBe('2026-08-01');
    expect(url.searchParams.get('endDate')).toBe('2026-08-31');
  });

  it('getSessions omite los filtros no provistos en vez de mandarlos vacíos', async () => {
    const fetchMock = stubFetch({ ok: true, data: [] });

    await getSessions({ from: '2026-08-01', coachId: 'coach-1' });

    const url = new URL(calledUrl(fetchMock));
    expect(url.searchParams.get('from')).toBe('2026-08-01');
    expect(url.searchParams.get('coachId')).toBe('coach-1');
    expect(url.searchParams.has('to')).toBe(false);
    expect(url.searchParams.has('classId')).toBe(false);
  });

  it('getNotifications manda offset=0 y limit=0 (no los trata como ausentes)', async () => {
    const fetchMock = stubFetch({ items: [] });

    await getNotifications({ limit: 0, offset: 0 });

    const url = new URL(calledUrl(fetchMock));
    expect(url.searchParams.get('limit')).toBe('0');
    expect(url.searchParams.get('offset')).toBe('0');
  });

  it('getNotifications solo manda unreadOnly cuando es true', async () => {
    const fetchMock = stubFetch({ items: [] });

    await getNotifications({ unreadOnly: false });

    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/notifications');
  });

  it('getMyProgress apunta al propio usuario si no se pasa athleteId', async () => {
    const fetchMock = stubFetch({ ok: true, data: { attendance: null, assessments: [] } });

    await getMyProgress();

    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/me/progress');
  });

  it('getMyProgress con athleteId lo pasa como query param (familia viendo a un hijo)', async () => {
    const fetchMock = stubFetch({ ok: true, data: { attendance: null, assessments: [] } });

    await getMyProgress('athlete-9');

    const url = new URL(calledUrl(fetchMock));
    expect(url.searchParams.get('athleteId')).toBe('athlete-9');
  });

  it('getSessionAttendance filtra por sessionId en la query, no en el path', async () => {
    const fetchMock = stubFetch({ ok: true, data: [] });

    await getSessionAttendance('sess-7');

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe('/api/attendance');
    expect(url.searchParams.get('sessionId')).toBe('sess-7');
  });

  it('sendGroupAlert manda academyId por query y el resto en el body', async () => {
    const fetchMock = stubFetch({
      ok: true,
      data: { conversationId: 'c1', messageId: 'm1', recipientCount: 12 },
    });

    await sendGroupAlert('acad-1', 'sess-7', 'Clase cancelada por lluvia');

    const url = new URL(calledUrl(fetchMock));
    expect(url.searchParams.get('academyId')).toBe('acad-1');
    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({
      sessionId: 'sess-7',
      content: 'Clase cancelada por lluvia',
    });
  });
});

describe('escapado de valores que vienen de fuera', () => {
  it('getInvitationPreview escapa el token del deep link', async () => {
    const fetchMock = stubFetch({ ok: true, data: { email: 'a@b.com', role: 'parent', expired: false, academyNames: [] } });

    await getInvitationPreview('tok/con+raros=');

    expect(calledUrl(fetchMock)).toContain('token=tok%2Fcon%2Braros%3D');
  });

  it('getConversationMessages escapa el cursor de paginación', async () => {
    const fetchMock = stubFetch({ items: [], pagination: { hasMore: false, nextCursor: null } });

    await getConversationMessages('conv1', '2026-08-03T10:00:00+00:00');

    expect(calledUrl(fetchMock)).toContain('cursor=2026-08-03T10%3A00%3A00%2B00%3A00');
  });
});

describe('endpoints con requisitos de sesión particulares', () => {
  it('getInvitationPreview funciona sin sesión activa (preview público del deep link)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = stubFetch({ ok: true, data: { email: 'a@b.com', role: 'parent', expired: false, academyNames: [] } });

    await expect(getInvitationPreview('tok')).resolves.toMatchObject({ role: 'parent' });
    // Sin sesión no debe mandar un Authorization vacío ni fallar antes de fetch.
    expect(calledInit(fetchMock).headers.Authorization).toBeUndefined();
  });

  it('el resto de endpoints sí adjunta el Bearer de Supabase', async () => {
    const fetchMock = stubFetch({ children: [] });

    await getFamilyChildren();

    expect(calledInit(fetchMock).headers.Authorization).toBe('Bearer valid-token');
  });
});

describe('payloads con constantes que el backend valida', () => {
  it('deleteMyAccount manda la frase de confirmación exacta que espera el backend', async () => {
    // Apple 5.1.1 / Google data-deletion: el backend rechaza el borrado si la
    // frase no coincide literalmente. Cambiarla aquí rompe el flujo en release.
    const fetchMock = stubFetch({ ok: true, data: { ok: true } });

    await deleteMyAccount();

    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({
      confirm: 'ELIMINAR MI CUENTA',
    });
  });

  it('createAssessment fuerza assessmentType coach_feedback y conserva el input', async () => {
    const fetchMock = stubFetch({ ok: true, data: { id: 'as1' } });

    await createAssessment('athlete-1', {
      sessionId: 'sess-7',
      assessmentDate: '2026-08-03',
      overallComment: 'Buen progreso en viga',
    });

    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/assessments/athlete-1');
    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({
      assessmentType: 'coach_feedback',
      sessionId: 'sess-7',
      assessmentDate: '2026-08-03',
      overallComment: 'Buen progreso en viga',
    });
  });
});

describe('propagación de errores del backend', () => {
  it('un 403 del backend llega como ApiClientError con el code real, no como undefined', async () => {
    stubFetch({ ok: false, error: { code: 'FORBIDDEN', message: 'No es tu academia' } }, 403);

    await expect(getSessionAttendance('sess-ajena')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});
<<<<<<< HEAD

describe('idempotencia de mutaciones (ZAL-619 §6.2 + AC-09)', () => {
  it('upsertAttendance SIN idempotencyKey NO manda el header (compatibilidad hacia atrás)', async () => {
    const fetchMock = stubFetch({ ok: true, data: { ok: true } });

    await upsertAttendance('sess-1', [
      { athleteId: 'a1', status: 'present' },
    ]);

    expect(calledUrl(fetchMock)).toBe('https://app.zaltyko.test/api/attendance');
    expect(calledInit(fetchMock).headers['Idempotency-Key']).toBeUndefined();
  });

  it('upsertAttendance CON idempotencyKey la manda como header `Idempotency-Key`', async () => {
    const fetchMock = stubFetch({ ok: true, data: { ok: true } });
    const idemKey = '11111111-2222-4333-8444-555555555555';

    await upsertAttendance(
      'sess-1',
      [{ athleteId: 'a1', status: 'present' }],
      { idempotencyKey: idemKey }
    );

    expect(calledInit(fetchMock).headers['Idempotency-Key']).toBe(idemKey);
    // El body sigue siendo { sessionId, entries } — el header va aparte.
    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({
      sessionId: 'sess-1',
      entries: [{ athleteId: 'a1', status: 'present' }],
    });
  });

  it('un 409 IDEMPOTENCY_CONFLICT del backend llega como ApiClientError traducible', async () => {
    // Cuando el backend implemente el header, un cambio de payload con la
    // misma clave debe responder 409 con este code. La UI lo traduce
    // (ver error-codes.ts) a copy seguro y nextAction=contact_support.
    stubFetch(
      { ok: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: 'distinto payload' } },
      409
    );

    await expect(
      upsertAttendance('sess-1', [{ athleteId: 'a1', status: 'present' }], {
        idempotencyKey: 'fixed-key',
      })
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      status: 409,
      retryable: false,
      nextAction: 'contact_support',
    });
  });
});

describe('aislamiento y errores esperados en getConversations (ZAL-622 AC-04 + §6.5)', () => {
  // El backend filtra conversaciones por membership server-side. La app
  // móvil NUNCA debe poder listar conversaciones de otra familia aunque
  // el filtro falle — la degradación correcta es lista vacía (empty
  // state) o error traducible, nunca datos cruzados.

  it('lista vacía para un parent sin conversaciones devuelve [] (no error)', async () => {
    // Caso normal: el backend responde 200 con items vacío. La UI debe
    // mostrar empty state localizado, no un error banner genérico.
    stubFetch({ items: [] });

    await expect(getConversations()).resolves.toEqual([]);
  });

  it('FORBIDDEN_ROLE (rol sin acceso a mensajería) se traduce a nextAction=contact_support', async () => {
    // Si un parent pierde acceso a mensajería por un cambio de rol o
    // academia, el backend responde 403 con code contractual. La UI lo
    // muestra como "No tienes permiso" con CTA a soporte, no como
    // pantalla de error recuperable.
    stubFetch(
      { ok: false, error: { code: 'FORBIDDEN_ROLE', message: 'No es tu academia' } },
      403
    );

    await expect(getConversations()).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      status: 403,
      retryable: false,
      nextAction: 'contact_support',
    });
  });

  it('AUTH_REQUIRED (token expirado) se traduce a nextAction=reauth, NO como lista vacía', async () => {
    // Crítico para aislamiento: si la sesión venció, la app no debe
    // mostrar "Sin conversaciones" como si no hubiera nada — debe
    // pedir re-auth para que el backend pueda decidir qué conversaciones
    // realmente le corresponden al usuario actual.
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    stubFetch(
      { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Token vencido' } },
      401
    );

    await expect(getConversations()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
      retryable: false,
      nextAction: 'reauth',
    });
  });

  it('UNAUTHENTICATED (código real del backend) NO se colapsa a HTTP_401 cuando es 4xx', async () => {
    // El backend real usa `UNAUTHENTICATED` en vez del contractual
    // `AUTH_REQUIRED`. Como es 4xx con código desconocido, la política
    // asimétrica de client.ts conserva el código crudo para que
    // logs/soporte lo identifiquen, pero el `message` mostrado en UI
    // viene del FALLBACK (nunca del backend — ver AC-10).
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    stubFetch(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Stack trace: at foo' } },
      401
    );

    await expect(getConversations()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED', // código crudo preservado, no colapsado a HTTP_401
      status: 401,
      message: expect.not.stringContaining('Stack trace'),
    });
  });
});

describe('family my-dashboard aislamiento (ZAL-622 AC-08)', () => {
  it('parent recibe el resumen compuesto sin aceptar academyId desde el cliente', async () => {
    const fetchMock = vi.fn();
    for (const response of [
      jsonResponse({ ok: true, data: [{ id: 'class-1', className: 'Infantil', day: 'lun', time: '17:00', location: 'Sala 1', coach: 'Ana' }] }),
      jsonResponse({ ok: true, data: { count: 1 } }),
      jsonResponse({ ok: true, data: { items: [{ id: 'conversation-1', unreadCount: 2 }] } }),
      jsonResponse({ ok: true, data: [{ id: 'charge-1', status: 'due' }] }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal('fetch', fetchMock);

    const bundle = await getMyDashboard('parent');

    expect(bundle.nextClasses.items[0]?.id).toBe('class-1');
    expect(bundle.unread).toMatchObject({ notifications: 1, conversations: 2 });
    expect(bundle.pendingCharges.items[0]?.id).toBe('charge-1');
    expect(fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname)).toEqual([
      '/api/me/schedule',
      '/api/notifications/unread-count',
      '/api/messages/conversations',
      '/api/me/charges',
    ]);
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url as string).search).toBe('');
    }
  });

  it('admin recibe ApiClientError FORBIDDEN_ROLE y nextAction=contact_support', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = getMyDashboard('admin');
    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      nextAction: 'contact_support',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coach recibe ApiClientError FORBIDDEN_ROLE y no un dashboard vacío', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMyDashboard('coach')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      nextAction: 'contact_support',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('owner recibe ApiClientError FORBIDDEN_ROLE y no datos de familia', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMyDashboard('owner')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      nextAction: 'contact_support',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('estados contractuales del Cargo (ZAL-622 AC-06 + ZAL-619 §3.6)', () => {
  it('CHARGE_STATUSES expone los 8 estados del contrato en orden estable', () => {
    // El contrato fija exactamente 8 estados. Cualquier drift (un backend
    // que añade uno nuevo sin actualizar la app) debe fallar aquí para que
    // la decisión sea explícita, no silenciosa.
    expect(CHARGE_STATUSES).toEqual([
      'draft',
      'due',
      'partial',
      'paid',
      'overdue',
      'failed',
      'refunded',
      'cancelled',
    ]);
  });

  it('cada estado contractual tiene etiqueta localizada (AC-10/AC-11)', () => {
    // Misma longitud: no hay estado sin label. Garantiza que la UI NUNCA
    // muestre el enum crudo al usuario.
    expect(Object.keys(CHARGE_STATUS_LABEL).sort()).toEqual([...CHARGE_STATUSES].sort());
  });

  it('las etiquetas localizadas NO afirman recibo legal ni validez fiscal', () => {
    // ZAL-619 §3.6: "no se afirma recibo fiscal ni validez legal".
    // Si alguien añade "Recibo emitido" / "Factura válida" / "Válido
    // ante Hacienda" a un label, este test lo bloquea.
    const LEGAL_CLAIMS = [
      'recibo',
      'factura',
      'haciend',
      'fiscal',
      'legal',
      'válido',
      'valido',
      'certific',
    ];
    for (const status of CHARGE_STATUSES) {
      const label = CHARGE_STATUS_LABEL[status].toLowerCase();
      for (const claim of LEGAL_CLAIMS) {
        expect(label).not.toContain(claim);
      }
    }
  });

  it('isChargePayable cubre exactamente los 4 estados con acción de pago', () => {
    // La familia puede actuar (Pagar en web) en due/overdue/partial/failed.
    // NO en paid (ya está pagado), ni en refunded/cancelled/draft (sin
    // acción posible o aún no emitido por el dueño).
    const payable: string[] = [];
    const notPayable: string[] = [];
    for (const s of CHARGE_STATUSES) {
      if (isChargePayable(s)) payable.push(s);
      else notPayable.push(s);
    }
    expect(payable.sort()).toEqual(['due', 'failed', 'overdue', 'partial']);
    expect(notPayable.sort()).toEqual(['cancelled', 'draft', 'paid', 'refunded']);
  });

  it('los 4 estados `paid`/`refunded`/`cancelled`/`draft` NO son accionables', () => {
    // Refuerza el invariante: la UI no muestra "Pagar en web" para cargos
    // ya pagados, ya devueltos, ya cancelados o en borrador.
    expect(isChargePayable('paid')).toBe(false);
    expect(isChargePayable('refunded')).toBe(false);
    expect(isChargePayable('cancelled')).toBe(false);
    expect(isChargePayable('draft')).toBe(false);
  });
});
=======
>>>>>>> origin/main
