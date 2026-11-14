import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  familyPreferencesSchema,
  familyUuidSchema,
  markNoticesReadSchema,
  type FamilyNoticeKind,
} from "@/modules/family-access/domain/family-access-contract";
import { familyAccessTransaction, iso, rows } from "@/modules/family-access/application/family-access-shared";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const FAMILY_NOTICES_LIMIT = 50;

type Ref = AnyPgColumn | SQL;

/**
 * Guarda SQL de los avisos del portal, ligada a la cuenta de la sesión: el
 * tutor `guardianRef` es de esta cuenta, está activo, su academia está en
 * prueba o activa y conserva un vínculo activo con una familia activa. Toda
 * lectura o escritura de avisos del lado de la familia la lleva, así que una
 * cuenta nunca alcanza avisos, lecturas ni preferencias de otro tutor.
 */
export function familyOwnsGuardian(input: { userId: string; organizationRef: Ref; guardianRef: Ref }): SQL {
  return sql`exists (
    select 1
    from zaltyko.guardians fa_g
    join zaltyko.organizations fa_o on fa_o.id = fa_g.organization_id
    where fa_g.auth_user_id = ${input.userId}::uuid
      and fa_g.is_active
      and fa_o.status in ('trial', 'active')
      and fa_g.organization_id = ${input.organizationRef}
      and fa_g.id = ${input.guardianRef}
      and exists (
        select 1 from zaltyko.family_guardians fa_fg
        join zaltyko.families fa_f on fa_f.organization_id = fa_fg.organization_id and fa_f.id = fa_fg.family_id
        where fa_fg.organization_id = fa_g.organization_id and fa_fg.guardian_id = fa_g.id
          and fa_fg.is_active and fa_f.is_active
      )
  )`;
}

export type FamilyNoticeItem = {
  id: string;
  kind: FamilyNoticeKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type FamilyNoticesAcademy = {
  organizationId: string;
  organizationName: string;
  preferences: { emailSessionChanges: boolean; emailManualNotices: boolean };
  notices: FamilyNoticeItem[];
};

/** Avisos de la cuenta, agrupados por academia, con sus preferencias de correo. */
export async function listFamilyNotices(input: { userId: string }): Promise<FamilyNoticesAcademy[]> {
  familyUuidSchema.parse(input.userId);
  return familyAccessTransaction(async (tx) => {
    const academies = await rows<{
      organization_id: string; organization_name: string; email_session_changes: boolean | null; email_manual_notices: boolean | null;
    }>(tx, sql`select g.organization_id::text, o.name as organization_name, p.email_session_changes, p.email_manual_notices
      from zaltyko.guardians g
      join zaltyko.organizations o on o.id = g.organization_id
      left join zaltyko.guardian_notification_preferences p on p.organization_id = g.organization_id and p.guardian_id = g.id
      where ${familyOwnsGuardian({ userId: input.userId, organizationRef: sql`g.organization_id`, guardianRef: sql`g.id` })}
      order by o.name, g.organization_id
      limit 20`);
    if (academies.length === 0) return [];
    const notices = await rows<{
      organization_id: string; id: string; kind: FamilyNoticeKind; title: string; body: string; created_at: string | Date; read_at: string | Date | null;
    }>(tx, sql`select n.organization_id::text, n.id::text, n.kind, n.title, n.body, n.created_at, r.read_at
      from zaltyko.family_notice_recipients r
      join zaltyko.family_notices n on n.organization_id = r.organization_id and n.id = r.notice_id
      where ${familyOwnsGuardian({ userId: input.userId, organizationRef: sql`r.organization_id`, guardianRef: sql`r.guardian_id` })}
      order by n.created_at desc, n.id
      limit ${FAMILY_NOTICES_LIMIT}`);
    return academies.map((academy) => ({
      organizationId: academy.organization_id,
      organizationName: academy.organization_name,
      preferences: {
        emailSessionChanges: academy.email_session_changes ?? true,
        emailManualNotices: academy.email_manual_notices ?? true,
      },
      notices: notices
        .filter((notice) => notice.organization_id === academy.organization_id)
        .map((notice) => ({
          id: notice.id,
          kind: notice.kind,
          title: notice.title,
          body: notice.body,
          createdAt: iso(notice.created_at),
          readAt: notice.read_at ? iso(notice.read_at) : null,
        })),
    }));
  });
}

/**
 * Marca como leídos avisos de la propia cuenta. Un id ajeno o inexistente no
 * cambia nada y no se distingue de uno ya leído.
 */
export async function markFamilyNoticesRead(input: { userId: string; body: unknown }): Promise<{ updated: number }> {
  familyUuidSchema.parse(input.userId);
  const parsed = markNoticesReadSchema.parse(input.body);
  return familyAccessTransaction(async (tx) => {
    const updated = await rows<{ id: string }>(tx, sql`update zaltyko.family_notice_recipients r
      set read_at = clock_timestamp()
      where r.read_at is null
        and r.notice_id in (${sql.join(parsed.noticeIds.map((id) => sql`${id}::uuid`), sql`,`)})
        and ${familyOwnsGuardian({ userId: input.userId, organizationRef: sql`r.organization_id`, guardianRef: sql`r.guardian_id` })}
      returning r.id::text`);
    return { updated: updated.length };
  });
}

/** Guarda las preferencias de correo de la cuenta en una academia. */
export async function setFamilyNotificationPreferences(input: { userId: string; body: unknown }) {
  familyUuidSchema.parse(input.userId);
  const parsed = familyPreferencesSchema.parse(input.body);
  return familyAccessTransaction(async (tx) => {
    const guardians = await rows<{ id: string }>(tx, sql`select g.id::text from zaltyko.guardians g
      where g.organization_id = ${parsed.organizationId}::uuid
        and ${familyOwnsGuardian({ userId: input.userId, organizationRef: sql`g.organization_id`, guardianRef: sql`g.id` })}`);
    const guardian = guardians[0];
    if (!guardian) throw new OperationalError("NOT_FOUND", "No tienes acceso a esta academia.", 404);
    await tx.execute(sql`insert into zaltyko.guardian_notification_preferences
        (organization_id, guardian_id, email_session_changes, email_manual_notices, updated_at)
      values (${parsed.organizationId}::uuid, ${guardian.id}::uuid, ${parsed.emailSessionChanges}, ${parsed.emailManualNotices}, clock_timestamp())
      on conflict (organization_id, guardian_id) do update
        set email_session_changes = excluded.email_session_changes,
            email_manual_notices = excluded.email_manual_notices,
            updated_at = excluded.updated_at`);
    return { organizationId: parsed.organizationId, emailSessionChanges: parsed.emailSessionChanges, emailManualNotices: parsed.emailManualNotices };
  });
}
