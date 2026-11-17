import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  familyCollectionPreferences,
} from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
} from "@/modules/billing/application/plan-state";
import { isFamilyAutomaticCollectionOpen } from "@/modules/billing/application/charge-collection-mode";
import { isPreferenceRevisionCurrent } from "@/modules/billing/domain/collection-eligibility";
import { evaluateAutomaticCollectionPlanEligibility } from "@/modules/billing/domain/plan-eligibility";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { FAMILY_AUTOMATIC_COLLECTION_DISABLED } from "@/lib/stripe/family-automatic-collection-disabled";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";

const inputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
  familyId: z.guid(),
});

const commandSchema = inputSchema.extend({
  mode: z.enum(["manual", "automatic"]),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(8).max(150),
});

// Se conserva la importación histórica: la emisión y los scripts la usan desde aquí.
export { getChargeCollectionModeSnapshot } from "@/modules/billing/application/charge-collection-mode";

export interface FamilyCollectionPreference {
  organizationId: string;
  familyId: string;
  requestedMode: "manual" | "automatic";
  /**
   * Modo con el que nacerán las próximas cuotas mensuales si la familia tiene
   * además un método de pago activo (eso lo decide la emisión).
   */
  effectiveMode: "manual" | "automatic";
  version: number;
  entitlementRevision: number | null;
  preferenceEntitlementRevision: number | null;
  automaticPreferenceAvailable: boolean;
  automaticProcessingEnabled: boolean;
  automaticStatus: "available" | "paid_plan_required" | "not_released";
  requiresConfirmation: boolean;
}

function requireBillingRole(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o administración puede cambiar la preferencia de cobro",
      403
    );
  }
}

async function requireOrganizationWideScope(input: {
  canViewOrganizationAggregate: boolean;
  familyId: string;
  organizationId: string;
  locationIds: string[];
  executor: Pick<typeof db, "execute">;
}): Promise<void> {
  if (!input.canViewOrganizationAggregate) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Cambiar la preferencia de una familia requiere acceso a todas las sedes de la academia",
      403
    );
  }

  if (isFamilyAutomaticCollectionOpen()) {
    // Cobro automático abierto: la academia puede activarlo antes de la
    // primera cuota, así que basta con una familia activa de la academia.
    const family = await input.executor.execute(sql`
      select exists (
        select 1
        from zaltyko.families f
        where f.organization_id = ${input.organizationId}::uuid
          and f.id = ${input.familyId}::uuid
          and f.is_active
      ) as visible
    `);
    if (family.rows[0]?.visible !== true) {
      throw new OperationalError(
        "NOT_FOUND",
        "No se ha encontrado esa familia en tu academia",
        404
      );
    }
    return;
  }

  const visibleLocationIds = input.locationIds;
  const locationFilter = visibleLocationIds.length
    ? sql`c.location_id in (${sql.join(
        visibleLocationIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    : sql`false`;
  const visible = await input.executor.execute(sql`
    select exists (
      select 1
      from zaltyko.families f
      where f.organization_id = ${input.organizationId}::uuid
        and f.id = ${input.familyId}::uuid
        and f.is_active
        and exists (
          select 1
          from zaltyko.charges c
          inner join zaltyko.invoices i
            on i.organization_id = c.organization_id and i.id = c.invoice_id
          where c.organization_id = f.organization_id
            and c.family_id = f.id
            and c.status in ('due', 'partially_paid')
            and i.status not in ('draft', 'void')
            and ${locationFilter}
        )
    ) as visible
  `);
  if (visible.rows[0]?.visible !== true) {
    throw new OperationalError(
      "NOT_FOUND",
      "No se ha encontrado una familia con cargos pendientes en tu academia",
      404
    );
  }
}

async function buildPreference(
  executor: Pick<typeof db, "select" | "execute">,
  input: {
    organizationId: string;
    familyId: string;
    requestedMode: "manual" | "automatic";
    version: number;
    preferenceEntitlementRevision: number | null;
  }
): Promise<FamilyCollectionPreference> {
  const planState = await loadOrganizationPlanState(executor, input.organizationId);
  const entitlementRevision = planState.entitlement?.revision ?? null;

  if (!isFamilyAutomaticCollectionOpen()) {
    // Bandera apagada (o cerrojos cerrados): todo sigue en manual, igual que
    // antes de la Fase 3.
    return {
      organizationId: input.organizationId,
      familyId: input.familyId,
      requestedMode: input.requestedMode,
      effectiveMode: "manual",
      version: input.version,
      entitlementRevision,
      // Keep the stored revision visible for historical preferences, even though
      // the effective mode is always manual while the release is closed.
      preferenceEntitlementRevision: input.preferenceEntitlementRevision,
      automaticPreferenceAvailable: false,
      automaticProcessingEnabled: false,
      automaticStatus: "not_released",
      requiresConfirmation: false,
    };
  }

  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId: input.organizationId,
    entitlement: planState.entitlement,
    subscription: planState.subscription,
  });
  const automatic = input.requestedMode === "automatic";
  // Hubo un cambio real del plan después de guardar la preferencia: hay que
  // volver a confirmarla. Una renovación del mismo plan no cuenta.
  const stale =
    automatic &&
    plan.eligible &&
    !isPreferenceRevisionCurrent({
      preferenceRevision: input.preferenceEntitlementRevision,
      currentRevision: plan.entitlementRevision,
      planChangeRevision: await loadPlanChangeRevision(executor, input.organizationId),
    });
  return {
    organizationId: input.organizationId,
    familyId: input.familyId,
    requestedMode: input.requestedMode,
    effectiveMode: automatic && plan.eligible && !stale ? "automatic" : "manual",
    version: input.version,
    entitlementRevision,
    preferenceEntitlementRevision: input.preferenceEntitlementRevision,
    automaticPreferenceAvailable: plan.eligible,
    automaticProcessingEnabled: true,
    automaticStatus: plan.eligible ? "available" : "paid_plan_required",
    requiresConfirmation: stale,
  };
}

export async function getFamilyCollectionPreference(input: {
  userId: string;
  organizationId: string;
  familyId: string;
}): Promise<FamilyCollectionPreference> {
  const parsed = inputSchema.parse(input);
  const scope = await resolveOwnerScope(parsed);
  requireBillingRole(scope.member.role);
  await requireOrganizationWideScope({
    canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    familyId: parsed.familyId,
    organizationId: scope.organization.id,
    locationIds: scope.locations.map((location) => location.id),
    executor: db,
  });

  const [stored] = await db
    .select({
      requestedMode: familyCollectionPreferences.requestedMode,
      version: familyCollectionPreferences.version,
      entitlementRevision: familyCollectionPreferences.entitlementRevision,
    })
    .from(familyCollectionPreferences)
    .where(
      and(
        eq(familyCollectionPreferences.organizationId, scope.organization.id),
        eq(familyCollectionPreferences.familyId, parsed.familyId)
      )
    )
    .limit(1);

  return buildPreference(
    db,
    {
      organizationId: scope.organization.id,
      familyId: parsed.familyId,
      requestedMode: stored?.requestedMode ?? "manual",
      version: stored?.version ?? 0,
      preferenceEntitlementRevision: stored?.entitlementRevision ?? null,
    }
  );
}

export async function saveFamilyCollectionPreference(input: {
  userId: string;
  organizationId: string;
  familyId: string;
  mode: "manual" | "automatic";
  expectedVersion: number;
  idempotencyKey: string;
}): Promise<FamilyCollectionPreference> {
  const parsed = commandSchema.parse(input);
  const scope = await resolveOwnerScope(parsed);
  requireBillingRole(scope.member.role);

  if (!scope.canViewOrganizationAggregate) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Cambiar la preferencia de una familia requiere acceso a todas las sedes de la academia",
      403
    );
  }

  const automaticOpen = isFamilyAutomaticCollectionOpen();
  if (parsed.mode === "automatic" && !automaticOpen) {
    await requireOrganizationWideScope({
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
      familyId: parsed.familyId,
      organizationId: scope.organization.id,
      locationIds: scope.locations.map((location) => location.id),
      executor: db,
    });
    throw new OperationalError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      "El cobro automático familiar no está disponible; conserva el registro manual de pagos.",
      409,
      { code: FAMILY_AUTOMATIC_COLLECTION_DISABLED }
    );
  }

  return db.transaction(async (tx) => {
    await assertOrganizationOperationalWritable(tx, scope.organization.id);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`family-collection-preference:${scope.organization.id}:${parsed.familyId}`}, 0))`
    );
    await requireOrganizationWideScope({
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
      familyId: parsed.familyId,
      organizationId: scope.organization.id,
      locationIds: scope.locations.map((location) => location.id),
      executor: tx,
    });

    const now = new Date();
    const planState = await loadOrganizationPlanState(tx, scope.organization.id);
    const auditIdempotencyKey = `family-collection-preference:${parsed.idempotencyKey}`;
    const [priorCommand] = await tx
      .select({
        actorUserId: auditLog.actorUserId,
        after: auditLog.after,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, scope.organization.id),
          eq(auditLog.idempotencyKey, auditIdempotencyKey)
        )
      )
      .limit(1);
    if (priorCommand) {
      const priorAfter = priorCommand.after as Record<string, unknown> | null;
      const priorMetadata = priorCommand.metadata as Record<string, unknown>;
      if (
        priorCommand.actorUserId !== parsed.userId ||
        priorAfter?.familyId !== parsed.familyId ||
        priorAfter?.requestedMode !== parsed.mode ||
        priorMetadata.expectedVersion !== parsed.expectedVersion ||
        typeof priorMetadata.version !== "number"
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de envío ya se usó con otra preferencia",
          409
        );
      }
      return buildPreference(
        tx,
        {
          organizationId: scope.organization.id,
          familyId: parsed.familyId,
          requestedMode: parsed.mode,
          version: priorMetadata.version,
          preferenceEntitlementRevision:
            typeof priorMetadata.entitlementRevision === "number"
              ? priorMetadata.entitlementRevision
              : null,
        }
      );
    }

    if (parsed.mode === "automatic") {
      // Solo se llega aquí con el cobro automático abierto (bandera y
      // cerrojos). Además hace falta un plan de pago vigente.
      const plan = evaluateAutomaticCollectionPlanEligibility({
        organizationId: scope.organization.id,
        entitlement: planState.entitlement,
        subscription: planState.subscription,
        now,
      });
      if (!plan.eligible) {
        throw new OperationalError(
          "FEATURE_NOT_AVAILABLE",
          "El cobro automático solo se puede activar con un plan de pago vigente.",
          409,
          { reason: plan.reason }
        );
      }
    }
    const [stored] = await tx
      .select()
      .from(familyCollectionPreferences)
      .where(
        and(
          eq(familyCollectionPreferences.organizationId, scope.organization.id),
          eq(familyCollectionPreferences.familyId, parsed.familyId)
        )
      )
      .limit(1);
    const currentVersion = stored?.version ?? 0;
    if (currentVersion !== parsed.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La preferencia cambió en otra sesión. Recarga antes de volver a guardar.",
        409
      );
    }

    const entitlementRevision = planState.entitlement?.revision ?? null;
    const nextVersion = currentVersion + 1;
    if (stored) {
      await tx
        .update(familyCollectionPreferences)
        .set({
          requestedMode: parsed.mode,
          entitlementRevision,
          updatedByMemberId: scope.member.id,
          version: nextVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(familyCollectionPreferences.organizationId, scope.organization.id),
            eq(familyCollectionPreferences.familyId, parsed.familyId)
          )
        );
    } else {
      await tx.insert(familyCollectionPreferences).values({
        organizationId: scope.organization.id,
        familyId: parsed.familyId,
        requestedMode: parsed.mode,
        entitlementRevision,
        updatedByMemberId: scope.member.id,
        version: nextVersion,
        updatedAt: now,
      });
    }

    await appendAuditEntry(tx, {
      organizationId: scope.organization.id,
      locationId: null,
      actorUserId: parsed.userId,
      action: "billing.family_collection_preference_changed",
      targetType: "family_collection_preference",
      targetId: parsed.familyId,
      idempotencyKey: auditIdempotencyKey,
      before: {
        requestedMode: stored?.requestedMode ?? "manual",
        version: currentVersion,
      },
      after: { familyId: parsed.familyId, requestedMode: parsed.mode },
      metadata: {
        expectedVersion: currentVersion,
        version: nextVersion,
        memberId: scope.member.id,
        entitlementRevision,
      },
    });
    await appendOutboxEvent(tx, {
      organizationId: scope.organization.id,
      locationId: null,
      eventName: "billing.family_collection_preference_changed",
      aggregateType: "family_collection_preference",
      aggregateId: parsed.familyId,
      idempotencyKey: auditIdempotencyKey,
      payload: {
        familyId: parsed.familyId,
        requestedMode: parsed.mode,
        version: nextVersion,
        entitlementRevision,
      },
      occurredAt: now,
    });

    return buildPreference(
      tx,
      {
        organizationId: scope.organization.id,
        familyId: parsed.familyId,
        requestedMode: parsed.mode,
        version: nextVersion,
        preferenceEntitlementRevision: entitlementRevision,
      }
    );
  });
}
