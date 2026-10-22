import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, appendOutboxEvent, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import { resolveSaasOwnerScope } from "./owner-access";
import { getOrganizationUsage, type LimitedResource } from "./organization-usage";

/** Owner-only recovery path. Never calls the operational-write guard. */
export async function getRegularizationStatus(input: { userId: string; organizationId: string; resource?: LimitedResource; after?: string }) {
  return db.transaction(async tx => {
    await resolveSaasOwnerScope({ ...input, tx });
    const usage = await getOrganizationUsage(tx, input.organizationId);
    if (!input.resource) return { ...usage, items: [], next: null };
    const resource = input.resource;
    const table = resource === "athletes" ? sql`zaltyko.athletes r join zaltyko.people p on p.organization_id = r.organization_id and p.id = r.person_id` : resource === "groups" ? sql`zaltyko.groups r` : sql`zaltyko.class_templates r`;
    const name = resource === "athletes" ? sql`concat(p.given_name, ' ', p.family_name)` : sql`r.name`;
    const active = resource === "athletes" ? sql`r.is_active` : sql`r.status = 'active'`;
    const result = await tx.execute(sql`select r.id, ${name} as name from ${table} where r.organization_id = ${input.organizationId}::uuid and ${active} ${input.after ? sql`and r.id > ${input.after}::uuid` : sql``} order by r.id limit 51`);
    const items = result.rows.slice(0, 50) as Array<{ id: string; name: string }>;
    return { ...usage, items, next: result.rows.length > 50 ? items[49].id : null };
  });
}

export type ArchiveResourceInput = { userId: string; organizationId: string; resource: LimitedResource; resourceId: string; idempotencyKey: string };

/** Retains people, invoices, attendance and all history. No automatic selection. */
export async function archiveResourceInTransaction(tx: TransactionClient, input: ArchiveResourceInput) {
  const scope = await resolveSaasOwnerScope({ ...input, tx });
  await lockCommand(tx, input.organizationId, input.idempotencyKey);
  const resource = input.resource;
  const table = resource === "athletes" ? sql`zaltyko.athletes` : resource === "groups" ? sql`zaltyko.groups` : sql`zaltyko.class_templates`;
  const prior = await tx.execute(sql`select aggregate_id, payload from zaltyko.outbox_events where organization_id = ${input.organizationId}::uuid and event_name = 'saas.resource_archived' and idempotency_key = ${input.idempotencyKey} limit 1`);
  if (prior.rows[0]) {
    const payload = prior.rows[0].payload as Record<string, unknown>;
    if (prior.rows[0].aggregate_id !== input.resourceId || payload.resource !== resource) throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave corresponde a otro archivo", 409);
    return getOrganizationUsage(tx, input.organizationId);
  }
  const before = await tx.execute(sql`select id from ${table} where organization_id = ${input.organizationId}::uuid and id = ${input.resourceId}::uuid for update`);
  if (!before.rows[0]) throw new OperationalError("NOT_FOUND", "Ficha no encontrada", 404);

  // Close affiliations at the site's current date, retaining status histories.
  // Future starts end at their own start (valid zero-length range), never become active.
  if (resource === "athletes" || resource === "groups") {
    const predicate = resource === "athletes" ? sql`m.athlete_id = ${input.resourceId}::uuid` : sql`m.group_id = ${input.resourceId}::uuid`;
    await tx.execute(sql`
      with candidates as materialized (
        select m.id, m.status, greatest(m.starts_on, (current_timestamp at time zone l.timezone)::date) as ends_on
        from zaltyko.group_memberships m
        join zaltyko.groups g on g.organization_id = m.organization_id and g.id = m.group_id
        join zaltyko.locations l on l.organization_id = g.organization_id and l.id = g.location_id
        where m.organization_id = ${input.organizationId}::uuid and ${predicate} and m.status in ('pending','active','paused') for update of m
      ), changed as (
        update zaltyko.group_memberships m set status = 'ended', ends_on = c.ends_on, updated_at = current_timestamp
        from candidates c where m.organization_id = ${input.organizationId}::uuid and m.id = c.id returning m.id
      ) insert into zaltyko.group_membership_history (organization_id, membership_id, from_status, to_status, reason_code, changed_by_member_id, idempotency_key, effective_on)
      select ${input.organizationId}::uuid, c.id, c.status, 'ended', 'academy_request', ${scope.memberId}::uuid, md5(${input.idempotencyKey} || c.id::text), c.ends_on from candidates c join changed on changed.id = c.id
    `);
  }
  if (resource === "athletes" || resource === "classes") {
    const predicate = resource === "athletes" ? sql`e.athlete_id = ${input.resourceId}::uuid` : sql`e.class_template_id = ${input.resourceId}::uuid`;
    await tx.execute(sql`
      with candidates as materialized (
        select e.id, e.status, greatest(e.starts_on, (current_timestamp at time zone l.timezone)::date) as ends_on
        from zaltyko.enrollments e join zaltyko.locations l on l.organization_id = e.organization_id and l.id = e.location_id
        where e.organization_id = ${input.organizationId}::uuid and ${predicate} and e.status in ('pending','trial','active','paused') for update of e
      ), changed as (
        update zaltyko.enrollments e set status = 'cancelled', ends_on = c.ends_on, version = e.version + 1, updated_at = current_timestamp
        from candidates c where e.organization_id = ${input.organizationId}::uuid and e.id = c.id returning e.id
      ) insert into zaltyko.enrollment_status_history (organization_id, enrollment_id, from_status, to_status, reason_code, changed_by_member_id, idempotency_key, effective_on)
      select ${input.organizationId}::uuid, c.id, c.status, 'cancelled', 'academy_request', ${scope.memberId}::uuid, md5(${input.idempotencyKey} || c.id::text), c.ends_on from candidates c join changed on changed.id = c.id
    `);
  }
  if (resource === "classes") {
    await tx.execute(sql`update zaltyko.sessions set status = 'cancelled', updated_at = current_timestamp where organization_id = ${input.organizationId}::uuid and class_template_id = ${input.resourceId}::uuid and starts_at >= current_timestamp and status = 'scheduled'`);
  }
  await tx.execute(sql`update ${table} set ${resource === "athletes" ? sql`is_active = false` : sql`status = 'archived'`}, updated_at = current_timestamp where organization_id = ${input.organizationId}::uuid and id = ${input.resourceId}::uuid`);
  await appendAuditEntry(tx, { organizationId: input.organizationId, locationId: null, actorUserId: input.userId, action: "saas.resource_archived", targetType: resource, targetId: input.resourceId, idempotencyKey: input.idempotencyKey, after: { active: false }, metadata: { reason: "plan_regularization" } });
  await appendOutboxEvent(tx, { organizationId: input.organizationId, locationId: null, eventName: "saas.resource_archived", aggregateType: resource, aggregateId: input.resourceId, idempotencyKey: input.idempotencyKey, payload: { resource, resourceId: input.resourceId } });
  return getOrganizationUsage(tx, input.organizationId);
}

export async function archiveResource(input: ArchiveResourceInput) {
  return db.transaction(tx => archiveResourceInTransaction(tx, input));
}
