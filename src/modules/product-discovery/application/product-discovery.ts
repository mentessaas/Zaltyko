import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productDiscoveryInterests, productDiscoverySignals, memberLocationScopes, organizationMembers } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  discoverableFeatures, discoveryCommandSchema,
  FEATURE_CATALOG_VERSION, type DiscoveryCommand,
} from "../domain/feature-catalog";

type Interest = { intent: string | null; pilot: boolean };
type DiscoveryInput = { userId: string; organizationId: string; locationId?: string };
const scopeKey = (scope: OwnerScope) => scope.selectedLocationId ?? "organization";

async function storageAvailable(tx: TransactionClient): Promise<boolean> {
  const result = await tx.execute(sql`
    select case when to_regclass('zaltyko.product_discovery_interests') is not null
      and to_regclass('zaltyko.product_discovery_signals') is not null
    then has_table_privilege(current_user, 'zaltyko.product_discovery_interests', 'SELECT')
      and has_table_privilege(current_user, 'zaltyko.product_discovery_interests', 'INSERT')
      and has_table_privilege(current_user, 'zaltyko.product_discovery_interests', 'UPDATE')
      and has_table_privilege(current_user, 'zaltyko.product_discovery_interests', 'DELETE')
      and has_table_privilege(current_user, 'zaltyko.product_discovery_signals', 'SELECT')
      and has_table_privilege(current_user, 'zaltyko.product_discovery_signals', 'INSERT')
      and (select array_agg(column_name::text order by column_name) from information_schema.columns where table_schema = 'zaltyko' and table_name = 'product_discovery_interests')
        = array['feature_id','id','intent','location_id','member_id','organization_id','pilot','scope_key','updated_at']::text[]
      and (select array_agg(column_name::text order by column_name) from information_schema.columns where table_schema = 'zaltyko' and table_name = 'product_discovery_signals')
        = array['catalog_version','feature_id','first_seen_at','organization_id','signal']::text[]
      and (select count(*) = 2 from pg_class where oid in (to_regclass('zaltyko.product_discovery_interests'), to_regclass('zaltyko.product_discovery_signals')) and relrowsecurity and relforcerowsecurity)
      and exists (select 1 from pg_roles where rolname = current_user and
        (rolsuper or rolbypassrls or pg_has_role(current_user, 'service_role', 'USAGE')))
    else false end as available
  `);
  return result.rows[0]?.available === true;
}

async function currentMembership(tx: TransactionClient, scope: OwnerScope, userId: string) {
  const [member] = await tx.select({ role: organizationMembers.role, scopeMode: organizationMembers.locationScopeMode })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, scope.member.id), eq(organizationMembers.organizationId, scope.organization.id), eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
    .limit(1).for("share");
  if (!member || member.role !== scope.member.role) throw new OperationalError("FORBIDDEN", "El acceso ha cambiado; vuelve a cargar la página", 403);
  if (member.scopeMode !== "all") {
    if (!scope.selectedLocationId) throw new OperationalError("LOCATION_SCOPE_DENIED", "Selecciona una sede autorizada", 403);
    const [assigned] = await tx.select({ id: memberLocationScopes.locationId }).from(memberLocationScopes)
      .where(and(eq(memberLocationScopes.organizationId, scope.organization.id), eq(memberLocationScopes.memberId, scope.member.id), eq(memberLocationScopes.locationId, scope.selectedLocationId))).limit(1).for("share");
    if (!assigned) throw new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403);
  }
  return member;
}

async function readState(tx: TransactionClient, scope: OwnerScope) {
  const features = discoverableFeatures(scope.member.role);
  const measurementAvailable = await storageAvailable(tx);
  const rows = measurementAvailable ? await tx.select({ featureId: productDiscoveryInterests.featureId, intent: productDiscoveryInterests.intent, pilot: productDiscoveryInterests.pilot })
    .from(productDiscoveryInterests).where(and(
      eq(productDiscoveryInterests.organizationId, scope.organization.id), eq(productDiscoveryInterests.memberId, scope.member.id),
      eq(productDiscoveryInterests.scopeKey, scopeKey(scope)),
    )).limit(3) : [];
  return { measurementAvailable, features: features.map(({ roles: _roles, ...feature }) => {
    const state = rows.find(row => row.featureId === feature.id);
    const intent = typeof state?.intent === "string" && feature.intents.some(item => item.id === state.intent) ? state.intent : null;
    return { ...feature, interest: { intent, pilot: intent !== null && state?.pilot === true } satisfies Interest };
  }) };
}

export async function getProductDiscovery(input: DiscoveryInput) {
  const scope = await resolveOwnerScope(input);
  return db.transaction(async tx => {
    await currentMembership(tx, scope, input.userId);
    return readState(tx, scope);
  });
}

export async function recordProductDiscovery(input: DiscoveryInput, rawCommand: DiscoveryCommand) {
  const command = discoveryCommandSchema.parse(rawCommand);
  const scope = await resolveOwnerScope(input);
  if (!discoverableFeatures(scope.member.role).some(feature => feature.id === command.featureId)) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "Propuesta fuera de este perfil", 403);
  }
  return db.transaction(async tx => {
    // Only the discovery stream is locked. This is not an operational write,
    // subscription change, capacity reservation or enqueue to the metrics worker.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`product-discovery:${scope.organization.id}`}, 0))`);
    await currentMembership(tx, scope, input.userId);
    const state = await readState(tx, scope);
    if (!state.measurementAvailable) throw new OperationalError("FEATURE_NOT_AVAILABLE", "El registro de interés aún no está habilitado", 503);
    const before = state.features.find(feature => feature.id === command.featureId)!.interest;
    const signal = command.action === "exposure" || command.action === "open";
    const after: Interest = command.action === "interest" ? { intent: command.intent!, pilot: command.pilot ?? false } : { intent: null, pilot: false };
    if (!signal && before.intent === after.intent && before.pilot === after.pilot) return state;
    if (signal) {
      await tx.insert(productDiscoverySignals).values({ organizationId: scope.organization.id, featureId: command.featureId, catalogVersion: FEATURE_CATALOG_VERSION, signal: command.action }).onConflictDoNothing();
    } else if (command.action === "withdraw") {
      await tx.delete(productDiscoveryInterests).where(and(
        eq(productDiscoveryInterests.organizationId, scope.organization.id), eq(productDiscoveryInterests.memberId, scope.member.id),
        eq(productDiscoveryInterests.scopeKey, scopeKey(scope)), eq(productDiscoveryInterests.featureId, command.featureId),
      ));
    } else {
      await tx.insert(productDiscoveryInterests).values({ organizationId: scope.organization.id, memberId: scope.member.id,
        locationId: scope.selectedLocationId, scopeKey: scopeKey(scope), featureId: command.featureId, intent: command.intent!, pilot: command.pilot ?? false,
      }).onConflictDoUpdate({ target: [productDiscoveryInterests.organizationId, productDiscoveryInterests.memberId, productDiscoveryInterests.scopeKey, productDiscoveryInterests.featureId],
        set: { intent: command.intent!, pilot: command.pilot ?? false, updatedAt: sql`clock_timestamp()` },
      });
    }
    return readState(tx, scope);
  });
}
