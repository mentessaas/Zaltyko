import { createHash } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  locations,
  organizationBootstrapCommands,
  organizationMembers,
  organizations,
} from "@/db/zaltyko-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

export const bootstrapOrganizationSchema = z.object({
  userId: z.string().uuid(),
  organizationName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180).optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default("ES"),
  timezone: z.string().trim().min(3).max(80).default("Europe/Madrid"),
  locationName: z.string().trim().min(2).max(120),
  locationCode: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
  idempotencyKey: z.string().trim().min(8).max(150),
});

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

function requestHash(
  input: z.infer<typeof bootstrapOrganizationSchema>
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationName: input.organizationName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode,
        timezone: input.timezone,
        locationName: input.locationName,
        locationCode: input.locationCode,
      })
    )
    .digest("hex");
}

export async function bootstrapOrganization(
  command: BootstrapOrganizationCommand
): Promise<BootstrapOrganizationResult> {
  const input = bootstrapOrganizationSchema.parse(command);
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

    const [organization] = await tx
      .insert(organizations)
      .values({
        name: input.organizationName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode,
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
        timezone: input.timezone,
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
