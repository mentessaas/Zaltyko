/**
 * Cobro automático de cuotas (Fase 3, P2): «Día de cobro» de la academia.
 *
 * Sin ajuste guardado (o con `null`) cada cuota se cobra el día que vence;
 * con un día del 1 al 31, ese día del mes del vencimiento (en los meses más
 * cortos, el último día; nunca antes del vencimiento: collectionDate, en
 * domain/collection-plan.ts).
 *
 * El proceso diario lee el ajuste cada vez que elige qué cobrar, así que un
 * cambio afecta a todos los cobros que aún no se han reclamado; los ya
 * reclamados siguen su curso.
 *
 * Solo la propiedad o administración con todas las sedes, con versión
 * optimista y auditoría. Con la bandera apagada (o fuera de test, o contra la
 * base de producción) no está disponible.
 */
import { z } from "zod";

import { db } from "@/db";
import { FAMILY_AUTOMATIC_COLLECTION_DISABLED } from "@/lib/stripe/family-automatic-collection-disabled";
import { isFamilyAutomaticCollectionOpen } from "@/modules/billing/application/charge-collection-mode";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  findCollectionSettings,
  insertCollectionSettings,
  lockCollectionSettings,
  updateCollectionSettings,
  type StoredCollectionSettings,
} from "@/modules/family-collection/infrastructure/collection-settings-store";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

/** Día fijo del mes: del 1 al 31 (Elvis, P2). */
export const COLLECTION_DAY_RANGE = { min: 1, max: 31 } as const;

export interface CollectionSettings {
  /** null = el día que vence cada cuota. */
  collectionDayOfMonth: number | null;
  /** 0 si la academia nunca lo guardó. */
  version: number;
  isDefault: boolean;
}

const readInputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
});

const saveInputSchema = readInputSchema.extend({
  collectionDayOfMonth: z
    .number()
    .int()
    .min(COLLECTION_DAY_RANGE.min)
    .max(COLLECTION_DAY_RANGE.max)
    .nullable(),
  expectedVersion: z.number().int().min(0),
});

const AUDIT_TARGET_TYPE = "organization_collection_settings";

function toSettings(stored: StoredCollectionSettings | null): CollectionSettings {
  if (!stored) return { collectionDayOfMonth: null, version: 0, isDefault: true };
  return {
    collectionDayOfMonth: stored.collectionDayOfMonth,
    version: stored.version,
    isDefault: false,
  };
}

async function assertAvailable(): Promise<void> {
  if (!isFamilyAutomaticCollectionOpen()) {
    throw new OperationalError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      "El cobro automático de cuotas no está disponible.",
      409,
      { code: FAMILY_AUTOMATIC_COLLECTION_DISABLED }
    );
  }
  if (!(await isFamilyCollectionStorageAvailable(db))) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "El cobro automático de cuotas no está disponible todavía.",
      503
    );
  }
}

/** Propiedad, o administración con acceso a todas las sedes. */
function requireCollectionSettingsScope(scope: OwnerScope): void {
  if (scope.member.role !== "owner" && scope.member.role !== "admin") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o administración puede cambiar el día de cobro",
      403
    );
  }
  if (!scope.canViewOrganizationAggregate) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Cambiar el día de cobro requiere acceso a todas las sedes de la academia",
      403
    );
  }
}

export async function getCollectionSettings(input: {
  userId: string;
  organizationId: string;
}): Promise<CollectionSettings> {
  const parsed = readInputSchema.parse(input);
  const scope = await resolveOwnerScope(parsed);
  requireCollectionSettingsScope(scope);
  await assertAvailable();
  return toSettings(await findCollectionSettings(db, scope.organization.id));
}

export async function saveCollectionSettings(input: {
  userId: string;
  organizationId: string;
  collectionDayOfMonth: number | null;
  expectedVersion: number;
  now?: Date;
}): Promise<CollectionSettings> {
  const parsed = saveInputSchema.parse({
    userId: input.userId,
    organizationId: input.organizationId,
    collectionDayOfMonth: input.collectionDayOfMonth,
    expectedVersion: input.expectedVersion,
  });
  const scope = await resolveOwnerScope({
    userId: parsed.userId,
    organizationId: parsed.organizationId,
  });
  requireCollectionSettingsScope(scope);
  await assertAvailable();
  const organizationId = scope.organization.id;
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    await assertOrganizationOperationalWritable(tx, organizationId);
    const current = await lockCollectionSettings(tx, organizationId);
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== parsed.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El día de cobro cambió en otra sesión. Recarga antes de volver a guardar.",
        409
      );
    }
    const before = current?.collectionDayOfMonth ?? null;
    if (current && before === parsed.collectionDayOfMonth) {
      // Sin cambios: no se escribe ni se audita.
      return toSettings(current);
    }

    const saved = current
      ? await updateCollectionSettings(tx, {
          organizationId,
          collectionDayOfMonth: parsed.collectionDayOfMonth,
          expectedVersion: currentVersion,
          memberId: scope.member.id,
          now,
        })
      : await insertCollectionSettings(tx, {
          organizationId,
          collectionDayOfMonth: parsed.collectionDayOfMonth,
          memberId: scope.member.id,
          now,
        });
    if (!saved) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El día de cobro cambió en otra sesión. Recarga antes de volver a guardar.",
        409
      );
    }

    await appendAuditEntry(tx, {
      organizationId,
      locationId: null,
      actorUserId: parsed.userId,
      action: "family_collection.settings_changed",
      targetType: AUDIT_TARGET_TYPE,
      targetId: organizationId,
      idempotencyKey: `family-collection-settings:${organizationId}:${saved.version}`,
      before: { collectionDayOfMonth: before, version: currentVersion },
      after: { collectionDayOfMonth: saved.collectionDayOfMonth, version: saved.version },
      metadata: { memberId: scope.member.id },
    });
    return toSettings(saved);
  });
}
