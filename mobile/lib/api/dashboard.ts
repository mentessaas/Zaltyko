// Cliente Mobile para `GET /api/dashboard/[academyId]/attention`.
//
// Contrato compartido Web/Mobile fijado en ZAL-619 §6.2 + ZAL-635. Mobile
// consume el MISMO endpoint que el dashboard operativo Web
// (`/app/[academyId]/dashboard/at-a-glance`) y el modo simple del coach
// (`/app/[academyId]/coach/today-simple`); no se crea una API paralela ni
// se duplica la agregación en cliente.
//
// Por qué este archivo existe aparte de endpoints.ts:
//   1. Aísla la dependencia con el shape compartido (importante porque el
//      backend puede evolucionar el bundle sin tocar endpoints.ts).
//   2. Concentra el discriminate entre `view=owner` (con cobros/import) y
//      `view=coach` (subset read-only) en un único punto.
//   3. Concentra el tratamiento de `sourceAvailable=false` (NUNCA mostrar
//      como 0, por contrato ZAL-619 §6.2: el "no sé" debe distinguirse del
//      "no hay datos").
//
// Tipos espejo de `src/lib/dashboard/attention-types.ts` (Web). Si la web
// renombra un campo, hay que tocar ambos lados en la misma PR.

import { apiGet } from './client';

export type AttentionView = 'owner' | 'coach';

export type PriorityActionKind =
  | 'review_failed_charges'
  | 'review_overdue_charges'
  | 'take_attendance'
  | 'review_failed_messages'
  | 'publish_drafts'
  | 'resolve_import';

export interface TodaySession {
  sessionId: string;
  classId: string;
  className: string | null;
  startsAt: string;
  groupName: string | null;
  attendanceRecorded: boolean;
  href: string;
}

export interface AttendancePendingBlock {
  count: number;
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export interface MessagesPendingBlock {
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
  status: 'overdue' | 'failed';
}

export interface ChargesOverdueBlock {
  overdue: number;
  failed: number;
  items: OverdueChargeItem[];
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export interface ProgressDraftsBlock {
  count: number;
  sourceAvailable: boolean;
  href: string | null;
  source: string;
}

export type ImportJobState =
  | 'created'
  | 'preview_ready'
  | 'mapping_required'
  | 'validated'
  | 'committed'
  | 'rolled_back'
  | 'failed'
  | 'cancelled';

export interface ImportActiveBlock {
  jobId: string;
  state: ImportJobState;
  filename: string | null;
  source: string;
  href: string;
}

export interface PriorityAction {
  kind: PriorityActionKind;
  label: string;
  href: string;
  source: string;
}

interface AttentionBase {
  academyId: string;
  /** YYYY-MM-DD, resuelta en la zona horaria de la academia (server-side). */
  date: string;
  today: TodaySession[];
  attendancePending: AttendancePendingBlock;
  messagesPending: MessagesPendingBlock;
  priorityAction: PriorityAction | null;
}

/** Bundle que ve el dueño (cobertura completa). */
export interface OwnerAttentionBundle extends AttentionBase {
  chargesOverdue: ChargesOverdueBlock;
  progressDrafts: ProgressDraftsBlock;
  /** `null` cuando no hay import en curso. La fuente puede caer a `null` también. */
  importActive: ImportActiveBlock | null;
}

/** Bundle que ve el coach (subset read-only, sin cobros ni import). */
export interface CoachAttentionBundle extends AttentionBase {}

/** Helper para que la UI decida cómo renderizar un contador. */
export type CountDisplay =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'unavailable' };

/**
 * Devuelve cómo renderizar un contador respetando el contrato:
 *   - `sourceAvailable=false` → "fuente no disponible" (NUNCA 0).
 *   - `count=0 && sourceAvailable=true` → "sin datos".
 *   - resto → el número real.
 *
 * Por qué no usar `?? 0` en la UI: cuando `sourceAvailable` es `false`
 * el `count` que devuelve el backend es **no autoritativo** (compatibilidad
 * de shape), y presentarlo como cero es mentir al usuario (ZAL-619 §6.2).
 */
export function renderCount(
  block: { count: number; sourceAvailable: boolean } | undefined | null
): CountDisplay {
  if (!block) return { kind: 'unavailable' };
  if (!block.sourceAvailable) return { kind: 'unavailable' };
  if (block.count === 0) return { kind: 'empty' };
  return { kind: 'value', value: block.count };
}

/**
 * Llama a `GET /api/dashboard/[academyId]/attention` con la `view` pedida.
 *
 * El cliente envía el `academyId` en la ruta para el enrutamiento, pero
 * la autorización es server-side (`withTenant` + `verifyAcademyAccessForProfile`);
 * no se considera una prueba de permiso en cliente (ver ZAL-635 §Tenant).
 *
 * `date` se omite a propósito para que el server resuelva en la zona
 * horaria de la academia. Esto evita que el cliente envíe la fecha local
 * del dispositivo y produzca mismatch con el día "oficial" de la academia
 * (riesgo residual documentado en ZAL-635 §Riesgos).
 */
export function getAttention(
  academyId: string,
  view: AttentionView
): Promise<OwnerAttentionBundle | CoachAttentionBundle> {
  const search = new URLSearchParams({ view });
  return apiGet<OwnerAttentionBundle | CoachAttentionBundle>(
    `/api/dashboard/${encodeURIComponent(academyId)}/attention?${search.toString()}`
  );
}
