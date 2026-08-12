// Wrappers tipados sobre apiGet/apiPost por dominio. Mantenerlos en
// un solo archivo permite ver de un vistazo qué endpoints consume la
// app móvil y cuáles faltan por añadir.
//
// Convenciones:
//   - Todos los tipos reflejan lo que devuelve el backend hoy
//     (camelCase en su mayoría). Si el backend renombra, tocar aquí.
//   - Los endpoints no estándar (ej. /api/family/children devuelve
//     `{ children }` en lugar de `{ data: children }`) se manejan con
//     un genérico explícito: `apiGet<{ children: T[] }>(...)`.
//   - IDs en string (uuid). Fechas en ISO string — formatear en UI.

import { apiGet, apiPost, apiPut, apiDelete } from './client';

// ===== Profile =====

export interface MeProfile {
  id: string;
  email: string;
  fullName: string | null;
  role:
    | 'super_admin'
    | 'owner'
    | 'admin'
    | 'coach'
    | 'parent'
    | 'athlete'
    | 'viewer';
  academyId: string | null;
  academyName: string | null;
}

export const getMe = () => apiGet<MeProfile>('/api/me');

// ===== Family children =====

export interface FamilyChild {
  id: string;
  name: string;
  birthdate?: string | null;
  academyId?: string | null;
  academyName?: string | null;
}

export async function getFamilyChildren(): Promise<FamilyChild[]> {
  // /api/family/children devuelve { children }, no { data: children }.
  const res = await apiGet<{ children: FamilyChild[] }>('/api/family/children');
  return res.children;
}

// ===== Schedule =====

export interface ScheduleItem {
  id: string;
  className: string;
  day: string;
  time: string;
  location: string;
  coach: string;
}

export const getMySchedule = () => apiGet<ScheduleItem[]>('/api/me/schedule');

// ===== Classes / enrollments =====

export interface ClassSession {
  id: string;
  className: string;
  startTime: string;
  endTime: string;
  dayOfWeek?: number;
  location?: string | null;
  coachName?: string | null;
}

export const getAthleteClasses = (athleteId: string) =>
  apiGet<ClassSession[]>(`/api/athletes/${athleteId}/classes`);

export const enrollInClass = (input: {
  academyId: string;
  classId: string;
  athleteId: string;
}) =>
  apiPost<{ ok: true; id: string }>(`/api/class-enrollments`, input);

export const cancelEnrollment = (enrollmentId: string) =>
  apiDelete<{ ok: true }>(`/api/class-enrollments/${enrollmentId}`);

// ===== Charges / invoices =====

// Estados contractuales del Cargo según ZAL-619 §3.6 + tabla de
// estados (Cargo): `draft`, `due`, `partial`, `paid`, `overdue`,
// `failed`, `refunded`, `cancelled`. La app NO inventa estados
// fuera de este set (AC-11). `paid` requiere respaldo del mecanismo
// de pago; la UI nunca afirma recibo legal.
export type ChargeStatus =
  | 'draft'
  | 'due'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export const CHARGE_STATUSES = [
  'draft',
  'due',
  'partial',
  'paid',
  'overdue',
  'failed',
  'refunded',
  'cancelled',
] as const satisfies readonly ChargeStatus[];

// Copy localizado para badges de cargo. NO usa palabras que
// afirmarían recibo legal ("Recibo emitido", "Factura válida", etc.).
export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  draft: 'Borrador',
  due: 'Pendiente de vencer',
  partial: 'Pago parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
  failed: 'Pago fallido',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
};

// ¿El CTA "Pagar en web" debe mostrarse? Solo en estados no pagados
// donde aún hay acción posible para la familia. `paid`/`refunded`/
// `cancelled`/`draft` no son accionables; `partial` permite completar
// el pago; `due`/`overdue`/`failed` requieren pago.
export const isChargePayable = (status: ChargeStatus): boolean =>
  status === 'due' || status === 'overdue' || status === 'partial' || status === 'failed';

export interface Charge {
  id: string;
  athleteId: string;
  athleteName: string;
  academyId: string;
  amountCents: number;
  currency: string;
  label: string | null;
  status: ChargeStatus;
  dueDate: string | null;
  paidAt: string | null;
  period: string | null;
  createdAt: string;
}

export const getMyCharges = () =>
  apiGet<Charge[]>('/api/me/charges');

export const getChargePayUrl = async (chargeId: string): Promise<string> => {
  // Devuelve la URL absoluta a la que abrir WebBrowser para pagar.
  const res = await apiPost<{ url: string }>(
    `/api/family/charges/${chargeId}/pay`,
    {}
  );
  return res.url;
};

// ===== Events =====

export interface UpcomingEvent {
  id: string;
  title: string;
  description: string | null;
  academyId: string;
  startDate: string;
  endDate: string;
  location: string | null;
  type: string;
  isPublic: boolean;
}

export const getUpcomingEvents = (params?: { startDate?: string; endDate?: string }) => {
  const search = new URLSearchParams();
  if (params?.startDate) search.set('startDate', params.startDate);
  if (params?.endDate) search.set('endDate', params.endDate);
  const q = search.toString();
  return apiGet<UpcomingEvent[]>(`/api/me/events${q ? `?${q}` : ''}`);
};

export const registerForEvent = (eventId: string) =>
  apiPost<{ ok: true }>(`/api/events/${eventId}/register`, {});

// ===== Coach: sessions, attendance, athletes =====

export interface ClassSessionRow {
  id: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
  notes: string | null;
  sportConfigId: string | null;
  classId: string;
  className: string;
  academyId: string;
  academyName: string;
  coachId: string | null;
  coachName: string | null;
}

export const getSessions = (params: { from?: string; to?: string; classId?: string; coachId?: string }) => {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.classId) search.set('classId', params.classId);
  if (params.coachId) search.set('coachId', params.coachId);
  const q = search.toString();
  return apiGet<ClassSessionRow[]>(`/api/class-sessions${q ? `?${q}` : ''}`);
};

export interface ClassSessionDetail {
  id: string;
  classId: string;
  tenantId: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  coachId: string | null;
  status: string | null;
  notes: string | null;
}

export const getClassSession = async (sessionId: string): Promise<ClassSessionDetail> => {
  // /api/class-sessions/[id] devuelve { item: {...} }, no el objeto directo.
  const res = await apiGet<{ item: ClassSessionDetail }>(
    `/api/class-sessions/${sessionId}`
  );
  return res.item;
};

export interface ClassAthlete {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  primarySportConfigId: string | null;
  groupSportConfigId: string | null;
  origin: 'group' | 'enrollment';
  enrollmentId?: string;
}

export const getClassAthletes = (classId: string) =>
  apiGet<ClassAthlete[]>(`/api/classes/${classId}/athletes`);

// Attendance status type — kept in sync with backend Zod schema.
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  athleteId: string;
  status: AttendanceStatus;
  notes: string | null;
  recordedAt: string;
}

export const getSessionAttendance = (sessionId: string) =>
  apiGet<AttendanceRecord[]>(`/api/attendance?sessionId=${sessionId}`);

export const upsertAttendance = (
  sessionId: string,
  entries: { athleteId: string; status?: AttendanceStatus; notes?: string }[],
  opts?: { idempotencyKey?: string }
) =>
  apiPost<{ ok: true }>(
    `/api/attendance`,
    { sessionId, entries },
    opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}
  );

// ===== Notifications =====

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  data: unknown;
}

export const getNotifications = async (params?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<NotificationItem[]> => {
  const search = new URLSearchParams();
  if (params?.unreadOnly) search.set('unreadOnly', 'true');
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  if (params?.offset !== undefined) search.set('offset', String(params.offset));
  const q = search.toString();
  // /api/notifications devuelve { items: [...] }, no array directo.
  const res = await apiGet<{ items: NotificationItem[] }>(
    `/api/notifications${q ? `?${q}` : ''}`
  );
  return res.items;
};

export const getUnreadCount = () =>
  apiGet<{ count: number }>('/api/notifications/unread-count');

export const markAllNotificationsRead = () =>
  apiPut<{ ok: true }>('/api/notifications/read-all', {});

export const deleteNotification = (id: string) =>
  apiDelete<{ ok: true }>(`/api/notifications/${id}`);

// ===== Account deletion =====
// Apple Guideline 5.1.1 y Google data-deletion: el usuario debe poder
// eliminar su cuenta desde la app. La web ya tiene este flujo en
// Settings; el móvil llama a /api/me/delete-account (sólo Bearer).

export const deleteMyAccount = () =>
  apiPost<{ ok: true }>('/api/me/delete-account', {
    confirm: 'ELIMINAR MI CUENTA',
  });

// ===== Messages (mensajería interna) =====
// Nuevas conversaciones solo las abre el staff/la academia; el móvil
// solo lista, lee y responde en conversaciones existentes.

export interface ConversationParticipant {
  userId: string;
  role: string;
  profile: { id: string; fullName: string | null; avatarUrl: string | null } | null;
}

export interface Conversation {
  id: string;
  academyId: string | null;
  title: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  otherParticipants: ConversationParticipant[];
  unreadCount: number;
}

export const getConversations = async (): Promise<Conversation[]> => {
  const res = await apiGet<{ items: Conversation[] }>('/api/messages/conversations');
  return res.items;
};

export interface ConversationMessage {
  id: string;
  senderId: string;
  content: string;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface ConversationMessagesPage {
  items: ConversationMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const getConversationMessages = async (
  conversationId: string,
  cursor?: string
): Promise<ConversationMessagesPage> => {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await apiGet<{
    items: ConversationMessage[];
    pagination: { hasMore: boolean; nextCursor: string | null };
  }>(`/api/messages/conversations/${conversationId}/messages${q}`);
  return { items: res.items, hasMore: res.pagination.hasMore, nextCursor: res.pagination.nextCursor };
};

export const sendConversationMessage = (conversationId: string, content: string) =>
  apiPost<{ id: string; createdAt: string }>(
    `/api/messages/conversations/${conversationId}/messages`,
    { content }
  );

// ===== Progress (asistencia + evaluaciones) =====
// Familia/atleta: mismo cálculo que my-dashboard web (últimos 30 días de
// asistencia + últimas 5 evaluaciones), reexpuesto en /api/me/progress.

export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  excused: number;
  recentRecords: { date: string; status: string; className: string }[];
}

export interface AssessmentSummary {
  id: string;
  assessmentDate: string;
  apparatus: string | null;
  overallComment: string | null;
  assessedByName: string | null;
}

export const getMyProgress = (athleteId?: string) =>
  apiGet<{ attendance: AttendanceStats | null; assessments: AssessmentSummary[] }>(
    `/api/me/progress${athleteId ? `?athleteId=${athleteId}` : ''}`
  );

// ===== Coach: registrar evaluación de progreso =====
// Nota rápida desde el mismo flujo donde se toma asistencia. Se omite
// aparato/sportConfigId a propósito: la validación de aparato válido por
// modalidad solo aplica si se envía, y aquí priorizamos velocidad sobre
// el detalle de rúbrica completo (eso queda para la web).

export const createAssessment = (
  athleteId: string,
  input: { sessionId?: string | null; assessmentDate: string; overallComment: string }
) =>
  apiPost<{ id: string }>(`/api/assessments/${athleteId}`, {
    assessmentType: 'coach_feedback',
    ...input,
  });

// ===== KPIs de un vistazo (owner/admin/super_admin) =====
// A propósito solo números — reportes y analítica completa siguen en
// la web, ver /api/me/kpis.

export interface AcademyKpis {
  athletes: number;
  coaches: number;
  groups: number;
  classesThisWeek: number;
  assessments: number;
  attendancePercent: number;
}

export const getMyKpis = () => apiGet<AcademyKpis>('/api/me/kpis');

// ===== Invitaciones (deep link) =====
// Vista previa pública (sin sesión) + aceptar (requiere sesión con el
// mismo email de la invitación). El alta de cuenta nueva sigue en la
// web — ver mobile/app/invite/[type].tsx.

export interface InvitationPreview {
  email: string;
  role: string;
  expired: boolean;
  academyNames: string[];
}

export const getInvitationPreview = (token: string) =>
  apiGet<InvitationPreview>(`/api/invitations/lookup?token=${encodeURIComponent(token)}`, {
    requireAuth: false,
  });

export const acceptInvitation = (token: string) =>
  apiPost<{ success: true; role: string; academyId: string | null; redirectUrl: string }>(
    '/api/invitations/complete',
    { token }
  );

// ===== Coach: aviso al grupo de una sesión =====
// Crea (o reutiliza) la conversación de grupo de la clase y manda el
// mensaje a todas las familias/atletas vinculados, con push incluido.

export const sendGroupAlert = (academyId: string, sessionId: string, content: string) =>
  apiPost<{ conversationId: string; messageId: string; recipientCount: number }>(
    `/api/messages/group-alert?academyId=${academyId}`,
    { sessionId, content }
  );