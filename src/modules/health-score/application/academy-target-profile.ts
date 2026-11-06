import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
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
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  appendAuditEntry,
  appendOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const targetDefinitions = [
  {
    key: "class_fill_rate",
    direction: "higher_better",
    grain: "month",
    currency: "none",
  },
  {
    key: "cohort_retention_rate",
    direction: "higher_better",
    grain: "month",
    currency: "none",
  },
  {
    key: "churn_rate",
    direction: "lower_better",
    grain: "month",
    currency: "none",
  },
  {
    key: "collection_rate",
    direction: "higher_better",
    grain: "month",
    currency: "profile",
  },
  {
    key: "attendance_coverage",
    direction: "higher_better",
    grain: "month",
    currency: "none",
  },
] as const;
const targetMetricKeys = targetDefinitions.map(({ key }) => key);

type TargetRow = {
  metricKey: string;
  value: string | number;
  currency: string | null;
};

function invalidTargetProfile(isReplay: boolean): never {
  throw new OperationalError(
    isReplay ? "IDEMPOTENCY_CONFLICT" : "INVALID_RELATION",
    isReplay
      ? "El perfil guardado no contiene exactamente las metas y monedas canónicas"
      : "No se puede cargar el perfil porque sus metas o monedas no son válidas",
    isReplay ? 409 : 422
  );
}

function canonicalTargetsWhere(
  profileId: string,
  profileCurrency: string | null,
  isReplay: boolean
) {
  if (!profileCurrency) invalidTargetProfile(isReplay);
  return and(
    eq(benchmarkMetricTargets.benchmarkProfileId, profileId),
    inArray(benchmarkMetricTargets.metricKey, targetMetricKeys),
    or(
      ...targetDefinitions.map((definition) =>
        and(
          eq(benchmarkMetricTargets.metricKey, definition.key),
          definition.currency === "profile"
            ? eq(benchmarkMetricTargets.currency, profileCurrency)
            : isNull(benchmarkMetricTargets.currency)
        )
      )
    )
  );
}

function assertCanonicalTargetRows(
  targets: TargetRow[],
  profileCurrency: string | null,
  isReplay: boolean
) {
  if (targets.length !== targetDefinitions.length) {
    invalidTargetProfile(isReplay);
  }
  const targetsByKey = new Map<string, TargetRow>();
  for (const target of targets) {
    const definition = targetDefinitions.find(({ key }) => key === target.metricKey);
    const expectedCurrency =
      definition?.currency === "profile" ? profileCurrency : null;
    if (
      !definition ||
      target.currency !== expectedCurrency ||
      targetsByKey.has(target.metricKey)
    ) {
      invalidTargetProfile(isReplay);
    }
    targetsByKey.set(target.metricKey, target);
  }
  if (targetDefinitions.some(({ key }) => !targetsByKey.has(key))) {
    invalidTargetProfile(isReplay);
  }
}

const ratioTarget = z.number().finite().min(0.01).max(1);
const storedTarget = (value: number) => Number(value.toFixed(8));
type TargetMetricKey = (typeof targetDefinitions)[number]["key"];
const targetSchema = Object.fromEntries(
  targetDefinitions.map(({ key }) => [key, ratioTarget])
) as Record<TargetMetricKey, typeof ratioTarget>;
export const academyTargetProfileSchema = z.object({
  organizationId: z.guid(),
  authorizationLocationId: z.guid(),
  actor: z.object({ userId: z.guid(), memberId: z.guid() }),
  targets: z.object(targetSchema),
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
  if (!profile.currency) invalidTargetProfile(false);
  const targets = (await db
    .select({
      metricKey: benchmarkMetricTargets.metricKey,
      value: benchmarkMetricTargets.targetNumeric,
      currency: benchmarkMetricTargets.currency,
    })
    .from(benchmarkMetricTargets)
    .where(canonicalTargetsWhere(profile.id, profile.currency, false))
    .limit(targetDefinitions.length + 1)) as TargetRow[];
  assertCanonicalTargetRows(targets, profile.currency, false);
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
      if (!profile.currency) invalidTargetProfile(true);
      const existingTargets = (await tx
        .select({
          metricKey: benchmarkMetricTargets.metricKey,
          value: benchmarkMetricTargets.targetNumeric,
          currency: benchmarkMetricTargets.currency,
        })
        .from(benchmarkMetricTargets)
        .where(canonicalTargetsWhere(profile.id, profile.currency, true))
        .limit(targetDefinitions.length + 1)) as TargetRow[];
      assertCanonicalTargetRows(existingTargets, profile.currency, true);
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

    // A valid idempotent replay is read-only; apply the SaaS write gate only
    // when this command is about to replace the active profile and targets.
    await assertOrganizationOperationalWritable(tx, input.organizationId);

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
          definition.currency === "profile" ? organization.currency : null,
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
