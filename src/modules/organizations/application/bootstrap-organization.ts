import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  locations,
  organizationBootstrapCommands,
  organizationMembers,
  organizationSports,
  organizations,
  programs,
  sportProfiles,
} from "@/db/zaltyko-schema";
import {
  academyOfferingsSchema,
  COMPLEMENTARY_ACTIVITY_LABELS,
  defaultLocationCode,
  GYMNASTICS_DISCIPLINE_LABELS,
  LAUNCH_MARKET_DEFAULTS,
} from "@/modules/organizations/domain/academy-offerings";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

const bootstrapOrganizationRequestFieldsSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180).optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default("ES"),
  locationName: z.string().trim().min(2).max(120),
  idempotencyKey: z.string().trim().min(8).max(150),
});

export const bootstrapOrganizationRequestSchema =
  bootstrapOrganizationRequestFieldsSchema.and(academyOfferingsSchema);

export const bootstrapOrganizationSchema =
  bootstrapOrganizationRequestFieldsSchema
    .extend({ userId: z.string().uuid() })
    .and(academyOfferingsSchema);

export type BootstrapOrganizationCommand = z.input<
  typeof bootstrapOrganizationSchema
>;

export interface BootstrapOrganizationResult {
  organizationId: string;
  locationId: string;
  memberId: string;
}

function assertValidTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value }).format();
  } catch {
    throw new OperationalError(
      "INVALID_RELATION",
      "La zona horaria no es válida",
      422
    );
  }
}

type ResolvedBootstrapInput = z.infer<typeof bootstrapOrganizationSchema> & {
  defaultCurrency: string;
  timezone: string;
  locationCode: string;
};

function requestHash(input: ResolvedBootstrapInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationName: input.organizationName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode,
        defaultCurrency: input.defaultCurrency,
        timezone: input.timezone,
        locationName: input.locationName,
        locationCode: input.locationCode,
        primaryDiscipline: input.primaryDiscipline,
        additionalDisciplines: [...input.additionalDisciplines].sort(),
        complementaryActivities: [...input.complementaryActivities].sort(),
        customActivityName: input.customActivityName ?? null,
      })
    )
    .digest("hex");
}

export async function bootstrapOrganization(
  command: BootstrapOrganizationCommand
): Promise<BootstrapOrganizationResult> {
  const parsed = bootstrapOrganizationSchema.parse(command);
  const marketDefaults =
    LAUNCH_MARKET_DEFAULTS[
      parsed.countryCode as keyof typeof LAUNCH_MARKET_DEFAULTS
    ];
  if (!marketDefaults) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Aún no está disponible el alta autoservicio para este país.",
      422
    );
  }
  const input: ResolvedBootstrapInput = {
    ...parsed,
    defaultCurrency: marketDefaults.currency,
    timezone: marketDefaults.timezone,
    locationCode: defaultLocationCode(parsed.locationName),
  };
  assertValidTimezone(input.timezone);
  const hash = requestHash(input);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`organization-bootstrap:${input.userId}`}, 0))`
    );
    const [prior] = await tx
      .select()
      .from(organizationBootstrapCommands)
      .where(
        and(
          eq(organizationBootstrapCommands.userId, input.userId),
          eq(organizationBootstrapCommands.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      if (prior.requestHash !== hash) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya fue usada con otros datos",
          409
        );
      }
      return {
        organizationId: prior.organizationId,
        locationId: prior.locationId,
        memberId: prior.memberId,
      };
    }

    const [existing] = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, input.userId),
          eq(organizationMembers.status, "active"),
          inArray(organizationMembers.role, ["owner", "admin"])
        )
      )
      .limit(1);
    if (existing) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "La cuenta ya tiene una organización activa",
        409
      );
    }

    const requestedDisciplines = [
      input.primaryDiscipline,
      ...input.additionalDisciplines,
    ];
    const availableProfiles = await tx
      .select({
        id: sportProfiles.id,
        disciplineKey: sportProfiles.disciplineKey,
      })
      .from(sportProfiles)
      .where(
        and(
          eq(sportProfiles.countryCode, input.countryCode),
          eq(sportProfiles.profileVersion, "identity-v1"),
          eq(sportProfiles.federationCode, "unconfigured"),
          inArray(sportProfiles.disciplineKey, requestedDisciplines),
          inArray(sportProfiles.status, ["identity_only", "verified"])
        )
      )
      .orderBy(asc(sportProfiles.disciplineKey))
      .limit(requestedDisciplines.length);
    const availableDisciplineKeys = new Set(
      availableProfiles.map((profile) => profile.disciplineKey)
    );
    if (
      availableProfiles.length !== requestedDisciplines.length ||
      availableDisciplineKeys.size !== requestedDisciplines.length ||
      requestedDisciplines.some(
        (discipline) => !availableDisciplineKeys.has(discipline)
      )
    ) {
      throw new OperationalError(
        "INVALID_RELATION",
        "Aún no hay un perfil deportivo disponible para el país y las disciplinas seleccionadas.",
        422
      );
    }

    const [organization] = await tx
      .insert(organizations)
      .values({
        name: input.organizationName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode,
        defaultCurrency: input.defaultCurrency,
        defaultTimezone: input.timezone,
        status: "trial",
      })
      .returning({ id: organizations.id });
    const [location] = await tx
      .insert(locations)
      .values({
        organizationId: organization.id,
        name: input.locationName,
        code: input.locationCode,
        timezone: input.timezone,
      })
      .returning({ id: locations.id });
    const [member] = await tx
      .insert(organizationMembers)
      .values({
        organizationId: organization.id,
        userId: input.userId,
        role: "owner",
        status: "active",
        locationScopeMode: "all",
      })
      .returning({ id: organizationMembers.id });

    const profileByDiscipline = new Map(
      availableProfiles.map((profile) => [profile.disciplineKey, profile.id])
    );
    const organizationSportRows = await tx
      .insert(organizationSports)
      .values(
        requestedDisciplines.map((discipline, index) => {
          const sportProfileId = profileByDiscipline.get(discipline);
          if (!sportProfileId) {
            throw new OperationalError(
              "INVALID_RELATION",
              "No se ha encontrado el perfil deportivo seleccionado.",
              422
            );
          }
          return {
            organizationId: organization.id,
            countryCode: input.countryCode,
            sportProfileId,
            role: index === 0 ? "primary" : "additional",
            status: "active",
          } as const;
        })
      )
      .returning({
        id: organizationSports.id,
        sportProfileId: organizationSports.sportProfileId,
      });

    const disciplineByProfileId = new Map(
      availableProfiles.map((profile) => [profile.id, profile.disciplineKey])
    );
    const programRows: (typeof programs.$inferInsert)[] =
      organizationSportRows.map((organizationSport) => {
        const discipline = disciplineByProfileId.get(
          organizationSport.sportProfileId
        );
        if (!discipline || !(discipline in GYMNASTICS_DISCIPLINE_LABELS)) {
          throw new OperationalError(
            "INVALID_RELATION",
            "El perfil deportivo no tiene una etiqueta de programa disponible.",
            422
          );
        }
        return {
          organizationId: organization.id,
          name: GYMNASTICS_DISCIPLINE_LABELS[
            discipline as keyof typeof GYMNASTICS_DISCIPLINE_LABELS
          ],
          kind: "gymnastics_sport" as const,
          organizationSportId: organizationSport.id,
          activityKey: null,
          status: "active" as const,
        };
      });
    for (const activity of input.complementaryActivities) {
      programRows.push({
        organizationId: organization.id,
        name: COMPLEMENTARY_ACTIVITY_LABELS[activity],
        kind: "complementary_activity",
        organizationSportId: null,
        activityKey: activity,
        status: "active",
      });
    }
    if (input.customActivityName) {
      programRows.push({
        organizationId: organization.id,
        name: input.customActivityName,
        kind: "complementary_activity",
        organizationSportId: null,
        activityKey: "custom",
        status: "active",
      });
    }
    await tx.insert(programs).values(programRows);

    const result = {
      organizationId: organization.id,
      locationId: location.id,
      memberId: member.id,
    };
    await appendAuditEntry(tx, {
      organizationId: organization.id,
      locationId: location.id,
      actorUserId: input.userId,
      action: "organization.bootstrapped",
      targetType: "organization",
      targetId: organization.id,
      idempotencyKey: `audit:${input.idempotencyKey}`,
      after: {
        status: "trial",
        countryCode: input.countryCode,
        defaultCurrency: input.defaultCurrency,
        timezone: input.timezone,
        primaryDiscipline: input.primaryDiscipline,
        additionalDisciplineCount: input.additionalDisciplines.length,
        programCount: programRows.length,
      },
    });
    await appendOutboxEvent(tx, {
      organizationId: organization.id,
      locationId: location.id,
      eventName: "organization.bootstrapped",
      aggregateType: "organization",
      aggregateId: organization.id,
      idempotencyKey: `outbox:${input.idempotencyKey}`,
      payload: {
        organizationId: organization.id,
        locationId: location.id,
        memberId: member.id,
        primaryDiscipline: input.primaryDiscipline,
        additionalDisciplineCount: input.additionalDisciplines.length,
        complementaryActivityCount:
          input.complementaryActivities.length +
          (input.customActivityName ? 1 : 0),
      },
    });
    await tx.insert(organizationBootstrapCommands).values({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
      ...result,
    });
    return result;
  });
}
