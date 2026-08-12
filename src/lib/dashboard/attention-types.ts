/**
 * Tipos del bundle "attention" compartido por Web y Mobile.
 *
 * Referencia: contrato ZAL-619 §3.2 (Dashboard operativo del dueño) y §5
 * (estados y transiciones). Toda métrica del bundle expone `source` para
 * que QA y Growth puedan trazarla al SQL o endpoint que la alimenta.
 *
 * Por convención, un bloque "sin datos" (consulta OK, sin coincidencias) se
 * representa con `count: 0` y `sourceAvailable: true`; una fuente que
 * falló al consultar se representa con `sourceAvailable: false` y `count`
 * omitido. Nunca se devuelve `null` con la intención de "no sé" para no
 * confundir con "no hay datos" en la UI.
 */

export type AttentionView = "owner" | "coach";

export interface AttentionSourceLink {
  /** Slug de la fuente (tabla, vista, o endpoint). */
  source: string;
  /** URL relativa al detalle de la métrica (puede ser null cuando no hay datos accionables). */
  href: string | null;
}

export interface AttendanceAttention {
  count: number;
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export interface MessagesAttention {
  unsent: number;
  failed: number;
  unread: number;
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export interface OverdueChargeItem {
  id: string;
  displayName: string;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  status: "overdue" | "failed";
}

export interface ChargesAttention {
  overdue: number;
  failed: number;
  items: OverdueChargeItem[];
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export interface ProgressAttention {
  count: number;
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export type ImportJobState =
  | "created"
  | "preview_ready"
  | "mapping_required"
  | "validated"
  | "committed"
  | "rolled_back"
  | "failed"
  | "cancelled";

export interface ImportActiveAttention {
  jobId: string;
  state: ImportJobState;
  filename: string | null;
  source: string;
  href: string;
}

export interface TodaySessionAttention {
  sessionId: string;
  classId: string;
  className: string | null;
  startsAt: string;
  groupName: string | null;
  attendanceRecorded: boolean;
  href: string;
}

export type PriorityActionKind =
  | "review_failed_charges"
  | "review_overdue_charges"
  | "take_attendance"
  | "review_failed_messages"
  | "publish_drafts"
  | "resolve_import";

export interface PriorityAction {
  kind: PriorityActionKind;
  label: string;
  href: string;
  source: string;
}

/** Bundle que ve el dueño (cobertura completa). */
export interface OwnerAttentionBundle {
  academyId: string;
  date: string;
  today: TodaySessionAttention[];
  attendancePending: AttendanceAttention;
  messagesPending: MessagesAttention;
  chargesOverdue: ChargesAttention;
  progressDrafts: ProgressAttention;
  importActive: ImportActiveAttention | null;
  priorityAction: PriorityAction | null;
}

/** Bundle que ve el coach (subset read-only, sin cobros ni import). */
export interface CoachAttentionBundle {
  academyId: string;
  date: string;
  today: TodaySessionAttention[];
  attendancePending: AttendanceAttention;
  messagesPending: MessagesAttention;
  priorityAction: PriorityAction | null;
}

export type AttentionBundle = OwnerAttentionBundle | CoachAttentionBundle;
