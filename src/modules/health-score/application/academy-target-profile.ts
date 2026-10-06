import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  benchmarkMetricTargets,
  benchmarkProfiles,
  locations,
  organizations,
} from "@/db/zaltyko-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const targetDefinitions = [
  { key: "class_fill_rate", direction: "higher_better", grain: "month" },
  { key: "cohort_retention_rate", direction: "higher_better", grain: "month" },
  { key: "churn_rate", direction: "lower_better", grain: "month" },
  { key: "collection_rate", direction: "higher_better", grain: "month" },
  { key: "attendance_coverage", direction: "higher_better", grain: "month" },
] as const;

const ratioTarget = z.number().finite().min(0.01).max(1);
const storedTarget = (value: number) => Number(value.toFixed(8));
export const academyTargetProfileSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  actor: z.object({ userId: z.string().uuid(), memberId: z.string().uuid() }),
  targets: z.object({
    class_fill_rate: ratioTarget,
    cohort_retention_rate: ratioTarget,
    churn_rate: ratioTarget,
    collection_rate: ratioTarget,
    attendance_coverage: ratioTarget,
  }),
  idempotencyKey: z.string().trim().min(8).max(150),
});

export type AcademyTargetProfileCommand = z.infer<
  typeof academyTargetProfileSchema
>;

export async function getAcademyTargetProfile(organizationId: string) {
  const [profile] = await db
    .select()
    .from(benchmarkProfiles)
    .where(
      and(
        eq(benchmarkProfiles.organizationId, organizationId),
        eq(benchmarkProfiles.key, "academy_internal_targets"),
        eq(benchmarkProfiles.status, "active")
      )
    )
    .orderBy(desc(benchmarkProfiles.version))
    .limit(1);
  if (!profile) return null;
  const targets = await db
    .select({
      metricKey: benchmarkMetricTargets.metricKey,
      value: benchmarkMetricTargets.targetNumeric,
    })
    .from(benchmarkMetricTargets)
    .where(eq(benchmarkMetricTargets.benchmarkProfileId, profile.id));
  return {
    id: profile.id,
    version: profile.version,
    name: profile.name,
    targets: Object.fromEntries(
      targets.map((target) => [target.metricKey, Number(target.value)])
    ),
  };
}

export async function saveAcademyTargetProfile(
  command: AcademyTargetProfileCommand
) {
  const input = academyTargetProfileSchema.parse(command);
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, "academy-target-profile");
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.authorizationLocationId,
      actor: input.actor,
      allowedRoles: ["owner", "admin"],
    });
    const [authorizationLocation] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, input.organizationId),
          eq(locations.id, input.authorizationLocationId),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    if (!authorizationLocation) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "Sede de autorización no disponible en esta academia",
        403
      );
    }
    const [prior] = await tx
      .select({ targetId: auditLog.targetId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, input.organizationId),
          eq(auditLog.idempotencyKey, `academy-targets:${input.idempotencyKey}`)
        )
      )
      .limit(1);
    if (prior) {
      if (!prior.targetId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia está vinculada a un resultado inválido",
          409
        );
      }
      const [profile] = await tx
        .select()
        .from(benchmarkProfiles)
        .where(eq(benchmarkProfiles.id, prior.targetId))
        .limit(1);
      if (
        !profile ||
        profile.organizationId !== input.organizationId ||
        profile.key !== "academy_internal_targets"
      ) {
        throw new OperationalError(
          "NOT_FOUND",
          "Perfil de objetivos no encontrado",
          404
        );
      }
      const existingTargets = await tx
        .select({
          metricKey: benchmarkMetricTargets.metricKey,
          value: benchmarkMetricTargets.targetNumeric,
        })
        .from(benchmarkMetricTargets)
        .where(eq(benchmarkMetricTargets.benchmarkProfileId, profile.id));
      if (existingTargets.length !== targetDefinitions.length) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El perfil guardado no coincide con esta solicitud",
          409
        );
      }
      for (const target of existingTargets) {
        const requestedTarget =
          input.targets[target.metricKey as keyof typeof input.targets];
        if (
          requestedTarget === undefined ||
          Number(target.value) !== storedTarget(requestedTarget)
        ) {
          throw new OperationalError(
            "IDEMPOTENCY_CONFLICT",
            "La clave ya se usó con otros objetivos",
            409
          );
        }
      }
      return {
        profileId: profile.id,
        version: profile.version,
        replayed: true,
      };
    }

    const [organization] = await tx
      .select({ currency: organizations.defaultCurrency })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (!organization) {
      throw new OperationalError("NOT_FOUND", "Academia no encontrada", 404);
    }
    const priorProfiles = await tx
      .select({ id: benchmarkProfiles.id, version: benchmarkProfiles.version })
      .from(benchmarkProfiles)
      .where(
        and(
          eq(benchmarkProfiles.organizationId, input.organizationId),
          eq(benchmarkProfiles.key, "academy_internal_targets")
        )
      )
      .orderBy(desc(benchmarkProfiles.version))
      .limit(1);
    const version = (priorProfiles[0]?.version ?? 0) + 1;
    await tx
      .update(benchmarkProfiles)
      .set({ status: "retired", updatedAt: new Date() })
      .where(
        and(
          eq(benchmarkProfiles.organizationId, input.organizationId),
          eq(benchmarkProfiles.status, "active")
        )
      );
    const [profile] = await tx
      .insert(benchmarkProfiles)
      .values({
        organizationId: input.organizationId,
        key: "academy_internal_targets",
        name: "Objetivos internos de la academia",
        market: "organization_internal",
        currency: organization.currency,
        organizationType: "gymnastics_academy",
        disciplineScope: "all_programs",
        sourceTitle:
          "Metas definidas por la academia; no es benchmark de mercado",
        sourceYear: null,
        methodologyNotes:
          "Objetivos internos introducidos por owner/admin. No representan promedios del sector ni datos de terceros.",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        version,
        status: "active",
      })
      .returning({ id: benchmarkProfiles.id });
    await tx.insert(benchmarkMetricTargets).values(
      targetDefinitions.map((definition) => ({
        benchmarkProfileId: profile.id,
        metricKey: definition.key,
        targetNumeric: storedTarget(input.targets[definition.key]),
        currency:
          definition.key === "collection_rate" ? organization.currency : null,
        grain: definition.grain,
        normalizationDirection: definition.direction,
        notes: "Objetivo interno configurado por owner/admin.",
      }))
    );
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: null,
      actorUserId: input.actor.userId,
      action: "health_score.internal_targets_configured",
      targetType: "benchmark_profile",
      targetId: profile.id,
      idempotencyKey: `academy-targets:${input.idempotencyKey}`,
      after: {
        version,
        currency: organization.currency,
        targets: input.targets,
      },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: null,
      eventName: "benchmark.configured",
      aggregateType: "benchmark_profile",
      aggregateId: profile.id,
      idempotencyKey: `benchmark-configured:${input.idempotencyKey}`,
      payload: { profileId: profile.id, version },
    });
    return { profileId: profile.id, version, replayed: false };
  });
}
