import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
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
  type GymnasticsDiscipline,
} from "@/modules/organizations/domain/academy-offerings";
import {
  OPERATIONAL_CURRENCIES,
  resolveAdministrativeMarket,
  type AdministrativeMarketCapability,
  type OperationalCurrency,
} from "@/modules/organizations/domain/administrative-market-capabilities";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { inspectLegacyAcademySchema } from "@/lib/auth/legacy-academy-access";
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
  defaultCurrency: z.preprocess(
    (value) =>
      typeof value === "string" ? value.trim().toUpperCase() : value,
    z.enum(OPERATIONAL_CURRENCIES).optional()
  ),
  timezone: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().trim().min(1).max(80).optional()
  ),
  locationName: z.string().trim().min(2).max(120),
  idempotencyKey: z.string().trim().min(8).max(150),
});

export const bootstrapOrganizationRequestSchema =
  bootstrapOrganizationRequestFieldsSchema.and(academyOfferingsSchema);

export const bootstrapOrganizationSchema =
  bootstrapOrganizationRequestFieldsSchema
    .extend({ userId: z.guid() })
    .and(academyOfferingsSchema);

export type BootstrapOrganizationCommand = z.input<
  typeof bootstrapOrganizationSchema
>;

export interface BootstrapOrganizationResult {
  organizationId: string;
  locationId: string;
  memberId: string;
  administrativeMarket: {
    countryCode: string;
    defaultCurrency: string;
    timezone: string;
  };
  sportCoverage: AdministrativeMarketCapability["sportCoverage"];
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
  marketTier: AdministrativeMarketCapability["tier"];
  sportCoverage: AdministrativeMarketCapability["sportCoverage"];
};

/**
 * Función de la migración candidata
 * `docs/deployment/candidates/20261112120000_general_market_identity_candidate.sql`.
 * Crea, solo si falta, el perfil de identidad vacío (sin reglas) de un país
 * del nivel general para una disciplina. Mientras el candidato no esté
 * aplicado, el alta de esos países responde 422 con un mensaje claro.
 */
const GENERAL_IDENTITY_PROVISIONER =
  "zaltyko_domain_private.ensure_general_identity_sport_profile(text,text)";

function resolveMarketSettings(input: {
  countryCode: string;
  defaultCurrency?: OperationalCurrency;
  timezone?: string;
}): {
  capability: AdministrativeMarketCapability;
  defaultCurrency: OperationalCurrency;
  timezone: string;
} {
  const capability = resolveAdministrativeMarket(input.countryCode);
  if (!capability || !capability.selfServe) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Aún no está disponible el alta autoservicio para este país.",
      422
    );
  }

  const defaultCurrency = input.defaultCurrency ?? capability.defaultCurrency;
  if (!defaultCurrency) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Selecciona la moneda en la que registrarás las cuotas (EUR o MXN).",
      422
    );
  }
  if (!capability.currencies.includes(defaultCurrency)) {
    throw new OperationalError(
      "INVALID_RELATION",
      "La moneda seleccionada no está disponible para este país.",
      422
    );
  }

  const timezone = input.timezone ?? capability.defaultTimezone;
  if (!timezone) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Selecciona la zona horaria de la sede para completar el alta.",
      422
    );
  }
  if (!capability.timezones.includes(timezone)) {
    throw new OperationalError(
      "INVALID_RELATION",
      "La zona horaria seleccionada no está disponible para este país.",
      422
    );
  }
  assertValidTimezone(timezone);

  return { capability, defaultCurrency, timezone };
}

/**
 * Nivel general: asegura un perfil de identidad vacío por disciplina pedida
 * mediante la función revisada del candidato. Sin el candidato, falla antes de
 * escribir nada y sin 500.
 */
async function provisionGeneralIdentityProfiles(
  execute: (query: SQL) => Promise<{ rows: unknown[] }>,
  countryCode: string,
  disciplines: readonly string[]
): Promise<void> {
  const availability = await execute(
    sql`select to_regprocedure(${GENERAL_IDENTITY_PROVISIONER}) is not null as available`
  );
  const available =
    (availability.rows[0] as { available?: unknown } | undefined)?.available ===
    true;
  if (!available) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "Todavía no podemos completar desde aquí el alta de academias de este país. No se ha creado nada. Escríbenos desde Contacto y te avisaremos en cuanto puedas crearla.",
      422,
      { reason: "general-market-onboarding-not-enabled" }
    );
  }
  for (const discipline of disciplines) {
    await execute(
      sql`select zaltyko_domain_private.ensure_general_identity_sport_profile(${countryCode}, ${discipline})`
    );
  }
}

function makeBootstrapResult(
  input: ResolvedBootstrapInput,
  ids: Pick<
    BootstrapOrganizationResult,
    "organizationId" | "locationId" | "memberId"
  >
): BootstrapOrganizationResult {
  return {
    ...ids,
    administrativeMarket: {
      countryCode: input.countryCode,
      defaultCurrency: input.defaultCurrency,
      timezone: input.timezone,
    },
    sportCoverage: input.sportCoverage,
  };
}

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
  const { capability, defaultCurrency, timezone } =
    resolveMarketSettings(parsed);
  const input: ResolvedBootstrapInput = {
    ...parsed,
    defaultCurrency,
    timezone,
    locationCode: defaultLocationCode(parsed.locationName),
    marketTier: capability.tier,
    sportCoverage: capability.sportCoverage,
  };
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
      return makeBootstrapResult(input, {
        organizationId: prior.organizationId,
        locationId: prior.locationId,
        memberId: prior.memberId,
      });
    }

    const legacySchemaState = await inspectLegacyAcademySchema((query) =>
      tx.execute(query)
    );
    if (legacySchemaState === "present") {
      const legacyMembership = await tx.execute(sql`
        select 1
        from public.profiles profile
        join public.academies academy
          on academy.tenant_id = profile.tenant_id
        left join public.memberships membership
          on membership.academy_id = academy.id
         and membership.user_id = profile.user_id
        where profile.user_id = ${input.userId}::uuid
          and (
            membership.user_id is not null
            or academy.owner_id = profile.id
          )
        limit 1
      `);
      if (legacyMembership.rows.length > 0) {
        throw new OperationalError(
          "INVALID_STATE_TRANSITION",
          "La cuenta ya tiene una relación con una academia existente. Solicita su vinculación antes de crear otra organización.",
          409,
          { reason: "legacy-academy-link-required" }
        );
      }
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
    const isGeneralMarket = input.marketTier === "general";
    if (isGeneralMarket) {
      await provisionGeneralIdentityProfiles(
        (query) => tx.execute(query),
        input.countryCode,
        requestedDisciplines
      );
    }
    // MX y el nivel general solo admiten perfiles de identidad vacíos.
    const hasGeneralIdentityOnly =
      input.sportCoverage.mode !== "discipline_identity";
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
          hasGeneralIdentityOnly
            ? and(
                eq(sportProfiles.status, "identity_only"),
                eq(sportProfiles.configurationSchemaVersion, 1),
                eq(sportProfiles.configuration, {})
              )
            : inArray(sportProfiles.status, ["identity_only", "verified"])
        )
      )
      .orderBy(asc(sportProfiles.disciplineKey))
      .limit(requestedDisciplines.length);
    const availableDisciplineKeys = new Set(
      availableProfiles.map((profile) => profile.disciplineKey)
    );
    const profilesAreAvailable =
      availableProfiles.length === requestedDisciplines.length &&
      availableDisciplineKeys.size === requestedDisciplines.length &&
      requestedDisciplines.every((discipline) =>
        availableDisciplineKeys.has(discipline)
      );
    if (!profilesAreAvailable) {
      throw new OperationalError(
        "INVALID_RELATION",
        isGeneralMarket
          ? "No hemos podido preparar las disciplinas elegidas para este país. No se ha creado nada; inténtalo de nuevo o escríbenos desde Contacto."
          : hasGeneralIdentityOnly
            ? "El alta administrativa de México requiere perfiles de identidad disponibles para cada disciplina seleccionada. No se aplicarán reglas federativas automáticamente."
            : "Aún no hay un perfil deportivo disponible para el país y las disciplinas seleccionadas.",
        422,
        isGeneralMarket
          ? { reason: "general-market-identity-profiles-required" }
          : hasGeneralIdentityOnly
            ? { reason: "mx-discipline-identity-profiles-required" }
            : undefined
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

    const profilesForOrganization = requestedDisciplines.map((discipline) => {
      const profile = availableProfiles.find(
        (candidate) => candidate.disciplineKey === discipline
      );
      if (!profile) {
        throw new OperationalError(
          "INVALID_RELATION",
          "No se ha encontrado el perfil deportivo seleccionado.",
          422
        );
      }
      return profile;
    });
    const organizationSportRows = await tx
      .insert(organizationSports)
      .values(
        profilesForOrganization.map((profile, index) => {
          return {
            organizationId: organization.id,
            countryCode: input.countryCode,
            sportProfileId: profile.id,
            role: index === 0 ? "primary" : "additional",
            status: "active",
          } as const;
        })
      )
      .returning({
        id: organizationSports.id,
        sportProfileId: organizationSports.sportProfileId,
      });
    const organizationSportIdByProfile = new Map(
      organizationSportRows.map((row) => [row.sportProfileId, row.id])
    );

    const programRows: (typeof programs.$inferInsert)[] =
      requestedDisciplines.map((discipline) => {
        const profile = availableProfiles.find(
          (candidate) => candidate.disciplineKey === discipline
        );
        const organizationSportId = profile
          ? organizationSportIdByProfile.get(profile.id)
          : undefined;
        if (
          !organizationSportId ||
          !(discipline in GYMNASTICS_DISCIPLINE_LABELS)
        ) {
          throw new OperationalError(
            "INVALID_RELATION",
            "El perfil deportivo no tiene una etiqueta de programa disponible.",
            422
          );
        }
        return {
          organizationId: organization.id,
          name: GYMNASTICS_DISCIPLINE_LABELS[
            discipline as GymnasticsDiscipline
          ],
          kind: "gymnastics_sport" as const,
          organizationSportId,
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

    const result = makeBootstrapResult(input, {
      organizationId: organization.id,
      locationId: location.id,
      memberId: member.id,
    });
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
        marketTier: input.marketTier,
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
      organizationId: result.organizationId,
      locationId: result.locationId,
      memberId: result.memberId,
    });
    return result;
  });
}
