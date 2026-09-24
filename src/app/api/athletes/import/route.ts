import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athleteImportBatches,
  athleteSportConfigs,
  athletes,
  groupAthletes,
  groups,
} from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { withTenant } from "@/lib/authz";
import { assertWithinPlanLimits, getActiveSubscription } from "@/lib/limits";
import { getResourceCount } from "@/lib/limits/resource-counters";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { createAuditLog } from "@/lib/authz/audit-service";
import { withTransaction } from "@/lib/db-transactions";
import { validatePayloadSize } from "@/lib/payload-validator";
import { NextRequest } from "next/server";
import { validateDateWithError, formatDateForDB } from "@/lib/validation/date-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";
import { markChecklistItem } from "@/lib/onboarding";

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.string().uuid().optional());

const CsvRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  academyId: z.string().uuid().optional(),
  dob: z.string().optional(),
  level: z.string().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  groupId: optionalUuid,
  groupName: z.string().optional(),
  sportConfigId: optionalUuid,
  sportConfigCode: z.string().optional(),
  programCode: z.string().optional(),
  levelCode: z.string().optional(),
  categoryCode: z.string().optional(),
});

type CsvRow = z.infer<typeof CsvRowSchema>;

export const runtime = "nodejs";

const handler = withTenant(async (request, context) => {
  let importBatchId: string | undefined;

  try {
    const formData = await request.formData();
    const file = (formData as unknown as { get(name: string): File | null }).get("file");

  if (!(file instanceof File)) {
    return apiError("FILE_REQUIRED", "File is required", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvText = buffer.toString("utf-8");
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const dryRunValue = (formData as unknown as { get(name: string): unknown }).get("dryRun");
  const dryRun = dryRunValue === "true" || dryRunValue === "1";
  const confirmValue = (formData as unknown as { get(name: string): unknown }).get("confirm");
  const confirmed = confirmValue === "true" || confirmValue === "1";
  const previewHashValue = (formData as unknown as { get(name: string): unknown }).get("previewHash");
  const previewHash = typeof previewHashValue === "string" ? previewHashValue.trim().toLowerCase() : "";

  // La importación es una operación destructiva desde el punto de vista de
  // datos: crea perfiles y puede activar el límite del plan. Todo cliente
  // debe pasar primero por la vista previa y confirmar exactamente el mismo
  // fichero. Mantener esta garantía en servidor evita que una UI antigua o un
  // script salte accidentalmente la revisión humana.
  if (!dryRun && !confirmed) {
    return apiError(
      "IMPORT_CONFIRMATION_REQUIRED",
      "Previsualiza el archivo y confirma la importación antes de crear gimnastas.",
      400,
    );
  }
  if (!dryRun && !/^[a-f0-9]{64}$/.test(previewHash)) {
    return apiError(
      "IMPORT_PREVIEW_REQUIRED",
      "Vuelve a generar la vista previa antes de confirmar la importación.",
      400,
    );
  }
  if (!dryRun && previewHash !== fileHash) {
    return apiError(
      "IMPORT_FILE_CHANGED",
      "El archivo cambió desde la vista previa. Genera una nueva vista previa para continuar.",
      409,
    );
  }

  if (!csvText.trim()) {
    return apiError("EMPTY_FILE", "File is empty", 400);
  }

  let records: CsvRow[];

  try {
    const raw = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    records = raw.map((row) => {
      const normalized = {
        name: row.name ?? row.Name ?? "",
        academyId: row.academyId ?? row.AcademyId ?? row.academy_id ?? "",
        dob: row.dob ?? row.DOB ?? row.birthdate ?? undefined,
        level: row.level ?? row.Level ?? undefined,
        status: row.status ?? row.Status ?? undefined,
        groupId: row.groupId ?? row.group_id ?? row.GroupId ?? undefined,
        groupName: row.groupName ?? row.group_name ?? row.group ?? row.Grupo ?? undefined,
        sportConfigId: row.sportConfigId ?? row.sport_config_id ?? row.SportConfigId ?? undefined,
        sportConfigCode: row.sportConfigCode ?? row.sport_config_code ?? row.SportConfigCode ?? undefined,
        programCode: row.programCode ?? row.program_code ?? row.ProgramCode ?? undefined,
        levelCode: row.levelCode ?? row.level_code ?? row.LevelCode ?? undefined,
        categoryCode: row.categoryCode ?? row.category_code ?? row.CategoryCode ?? undefined,
      };
      return CsvRowSchema.parse(normalized);
    });
  } catch (error) {
    logger.error("CSV parse error", error);
    return apiError("INVALID_CSV", "Invalid CSV format", 400);
  }

  const tenantOverride = (formData as unknown as { get(name: string): unknown }).get("tenantId");
  const requestedTenantId = typeof tenantOverride === "string" ? tenantOverride.trim() : "";
  if (requestedTenantId && !z.string().uuid().safeParse(requestedTenantId).success) {
    return apiError("INVALID_TENANT_ID", "Tenant ID must be a valid UUID", 400);
  }
  // Solo super_admin puede operar sobre otro tenant; el resto siempre queda
  // anclado al tenant resuelto por withTenant.
  const effectiveTenantId =
    context.profile.role === "super_admin" && requestedTenantId
      ? requestedTenantId
      : context.tenantId;

  if (!effectiveTenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  // Inferir la academia de cada fila: la del formData o, si el tenant tiene
  // una única academia, esa. Evita exigir UUIDs internos en el CSV.
  const formAcademyId = (formData as unknown as { get(name: string): unknown }).get("academyId");
  let defaultAcademyId: string | undefined =
    typeof formAcademyId === "string" && formAcademyId ? formAcademyId : undefined;
  if (!defaultAcademyId) {
    const tenantAcademies = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.tenantId, effectiveTenantId))
      .limit(1000);
    if (tenantAcademies.length === 1) {
      defaultAcademyId = tenantAcademies[0].id;
    }
  }
  records = records.map((row) => ({
    ...row,
    academyId: row.academyId || defaultAcademyId,
  }));

  const academyIds = Array.from(
    new Set(records.map((row) => row.academyId).filter((v): v is string => Boolean(v)))
  );

  const academiesRows = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.tenantId, effectiveTenantId), inArray(academies.id, academyIds)))
    .limit(1000);

  const validAcademyIds = new Set(academiesRows.map((row) => row.id));
  const configsByAcademy = new Map<string, Awaited<ReturnType<typeof getAcademySportConfigOptions>>>();
  const normalizeIdentityName = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const existingAthletes =
    validAcademyIds.size > 0
      ? await db
          .select({ academyId: athletes.academyId, name: athletes.name, dob: athletes.dob })
          .from(athletes)
          .where(
            and(
              eq(athletes.tenantId, effectiveTenantId),
              inArray(athletes.academyId, Array.from(validAcademyIds)),
              isNull(athletes.deletedAt),
            ),
          )
          .limit(10000)
      : [];
  const existingIdentityKeys = new Set(
    existingAthletes
      .filter((row) => row.dob)
      .map((row) => `${row.academyId}|${normalizeIdentityName(row.name)}|${String(row.dob)}`),
  );
  const importedIdentityKeys = new Set<string>();
  const importLimitState = new Map<string, { current: number; limit: number | null }>();
  await Promise.all(
    Array.from(validAcademyIds).map(async (academyId) => {
      const [subscription, current] = await Promise.all([
        getActiveSubscription(academyId),
        getResourceCount("athletes", academyId, effectiveTenantId),
      ]);
      importLimitState.set(academyId, {
        current,
        limit: subscription.athleteLimit,
      });
    }),
  );

  const summary = {
    total: records.length,
    created: 0,
    skipped: 0,
    errors: [] as Array<{ row: number; reason: string }>,
    potentialDuplicates: 0,
    dryRun,
    previewHash: fileHash,
    requiresConfirmation: dryRun,
    batchId: undefined as string | undefined,
  };

  // Crear el lote antes de insertar filas permite que cada atleta quede
  // asociado al mismo identificador incluso si una fila aislada falla. Si el
  // proceso se interrumpe, el lote queda en `processing` y no se ofrece como
  // rollback hasta que el resumen haya sido cerrado correctamente.
  if (!dryRun) {
    importBatchId = randomUUID();
    summary.batchId = importBatchId;
    const distinctAcademyIds = Array.from(
      new Set(records.map((row) => row.academyId).filter((value): value is string => Boolean(value))),
    );
    await db.insert(athleteImportBatches).values({
      id: importBatchId,
      tenantId: effectiveTenantId,
      academyId: distinctAcademyIds.length === 1 ? distinctAcademyIds[0] : null,
      initiatedBy: context.userId,
      fileHash,
      totalRows: records.length,
      status: "processing",
    });
  }

  for (const [index, record] of records.entries()) {
    if (!record.academyId) {
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason:
          "Falta la academia y el tenant tiene más de una: indica la columna academyId.",
      });
      continue;
    }
    if (!validAcademyIds.has(record.academyId)) {
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: `Academia ${record.academyId} no pertenece al tenant.`,
      });
      continue;
    }

    if (!record.academyId) continue;
    const resolvedAcademyId = record.academyId;

    const limitState = importLimitState.get(record.academyId);
    if (limitState && limitState.limit !== null && limitState.current >= limitState.limit) {
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: "El plan actual ya ha alcanzado el límite de gimnastas de esta academia.",
      });
      continue;
    }

    try {
      await assertWithinPlanLimits(effectiveTenantId, record.academyId, "athletes");

      let selectedGroup:
        | {
            id: string;
            sportConfigId: string | null;
            programCode: string | null;
            levelCode: string | null;
            categoryCode: string | null;
          }
        | null = null;

      if (record.groupId || record.groupName) {
        const groupConditions = [
          eq(groups.tenantId, effectiveTenantId),
          eq(groups.academyId, record.academyId),
          isNull(groups.deletedAt),
          record.groupId ? eq(groups.id, record.groupId) : eq(groups.name, record.groupName ?? ""),
        ];

        const [groupRow] = await db
          .select({
            id: groups.id,
            sportConfigId: groups.sportConfigId,
            programCode: groups.programCode,
            levelCode: groups.levelCode,
            categoryCode: groups.categoryCode,
          })
          .from(groups)
          .where(and(...groupConditions))
          .limit(1);

        if (!groupRow) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: record.groupId
              ? `Grupo ${record.groupId} no pertenece a la academia.`
              : `Grupo "${record.groupName}" no encontrado en la academia.`,
          });
          continue;
        }

        selectedGroup = groupRow;
      }

      let academyConfigs = configsByAcademy.get(record.academyId);
      if (!academyConfigs) {
        academyConfigs = await getAcademySportConfigOptions(record.academyId);
        configsByAcademy.set(record.academyId, academyConfigs);
      }

      const effectiveSportConfigId =
        record.sportConfigId ??
        selectedGroup?.sportConfigId ??
        (record.sportConfigCode
          ? academyConfigs.find((config) => config.code === record.sportConfigCode)?.id
          : null) ??
        null;
      const effectiveProgramCode = record.programCode ?? selectedGroup?.programCode ?? null;
      const effectiveLevelCode = record.levelCode ?? selectedGroup?.levelCode ?? null;
      const effectiveCategoryCode = record.categoryCode ?? selectedGroup?.categoryCode ?? null;

      if (record.sportConfigCode && !effectiveSportConfigId) {
        summary.skipped += 1;
        summary.errors.push({
          row: index + 2,
          reason: `Configuración deportiva "${record.sportConfigCode}" no activa en la academia.`,
        });
        continue;
      }

      if (effectiveSportConfigId) {
        const verifiedConfig = await verifyAcademySportConfig({
          academyId: record.academyId,
          tenantId: effectiveTenantId,
          sportConfigId: effectiveSportConfigId,
        });

        if (!verifiedConfig) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: "La configuración deportiva no está activa en esta academia.",
          });
          continue;
        }

        const selectedConfig = academyConfigs.find((config) => config.id === effectiveSportConfigId);

        if (effectiveProgramCode && !selectedConfig?.programs.some((program) => program.code === effectiveProgramCode)) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: `Programa "${effectiveProgramCode}" no válido para la configuración deportiva.`,
          });
          continue;
        }

        if (
          effectiveLevelCode &&
          !selectedConfig?.levels.some(
            (level) =>
              level.code === effectiveLevelCode &&
              (!effectiveProgramCode || !level.programCode || level.programCode === effectiveProgramCode)
          )
        ) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: `Nivel "${effectiveLevelCode}" no válido para la configuración deportiva.`,
          });
          continue;
        }

        if (
          effectiveCategoryCode &&
          !selectedConfig?.categories.some((category) => category.code === effectiveCategoryCode)
        ) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: `Categoría "${effectiveCategoryCode}" no válida para la configuración deportiva.`,
          });
          continue;
        }
      }

      // Validar fecha de nacimiento si se proporciona
      let dobDate: Date | null = null;
      if (record.dob) {
        const dateValidation = validateDateWithError(record.dob, "fecha de nacimiento");
        if (!dateValidation.success) {
          summary.skipped += 1;
          summary.errors.push({
            row: index + 2,
            reason: dateValidation.error || "Fecha de nacimiento inválida",
          });
          continue;
        }
        dobDate = dateValidation.date;
      }

      // Nombre + fecha solo identifica un posible duplicado; nunca se usa
      // para fusionar automáticamente, porque dos gemelas pueden compartir
      // ambos valores. En ese caso la fila queda para revisión explícita.
      if (dobDate) {
        const identityKey = `${record.academyId}|${normalizeIdentityName(record.name)}|${formatDateForDB(dobDate)}`;
        if (existingIdentityKeys.has(identityKey) || importedIdentityKeys.has(identityKey)) {
          summary.skipped += 1;
          summary.potentialDuplicates += 1;
          summary.errors.push({
            row: index + 2,
            reason:
              "Posible duplicado: ya existe una gimnasta con el mismo nombre y fecha de nacimiento en esta academia. Revisa la fila antes de importarla.",
          });
          continue;
        }
        importedIdentityKeys.add(identityKey);
      }

      if (!dryRun) {
        const athleteId = randomUUID();

        // Mantener el atleta y sus vínculos en una única unidad. Si falla la
        // asignación a grupo o modalidad, no dejamos una gimnasta huérfana ni
        // obligamos al owner a reparar la importación manualmente.
        await withTransaction(async (tx) => {
          await tx.insert(athletes).values({
            id: athleteId,
            tenantId: effectiveTenantId,
            academyId: resolvedAcademyId,
            name: record.name,
            dob: dobDate ? formatDateForDB(dobDate) : null,
            level: record.level ?? null,
            status: record.status ?? "active",
            groupId: selectedGroup?.id ?? null,
            primarySportConfigId: effectiveSportConfigId,
            programCode: effectiveProgramCode,
            levelCode: effectiveLevelCode,
            categoryCode: effectiveCategoryCode,
            importBatchId: importBatchId ?? null,
          });

          if (selectedGroup) {
            await tx
              .insert(groupAthletes)
              .values({
                id: randomUUID(),
                tenantId: effectiveTenantId,
                groupId: selectedGroup.id,
                athleteId,
              })
              .onConflictDoNothing();
          }

          if (effectiveSportConfigId) {
            await tx
              .insert(athleteSportConfigs)
              .values({
                id: randomUUID(),
                tenantId: effectiveTenantId,
                athleteId,
                academySportConfigId: effectiveSportConfigId,
                programCode: effectiveProgramCode,
                levelCode: effectiveLevelCode,
                categoryCode: effectiveCategoryCode,
              })
              .onConflictDoNothing();
          }
        });
      }

      summary.created += 1;
      if (limitState) limitState.current += 1;
    } catch (error) {
      logger.error("Import athlete error", error);
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

    // Igual que en el alta manual: la importación cuenta para el paso
    // "Añade al menos 5 atletas" del checklist de onboarding.
    if (!dryRun && summary.created > 0) {
      const touchedAcademies = Array.from(
        new Set(records.map((row) => row.academyId).filter(Boolean))
      ) as string[];
      for (const academyIdTouched of touchedAcademies) {
        try {
          const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(athletes)
            .where(
              and(
                eq(athletes.academyId, academyIdTouched),
                eq(athletes.tenantId, effectiveTenantId),
                isNull(athletes.deletedAt)
              )
            );
          if (Number(countResult?.count ?? 0) >= 5) {
            await markChecklistItem({
              academyId: academyIdTouched,
              tenantId: effectiveTenantId,
              key: "add_5_athletes",
            });
          }
        } catch (error) {
          logger.warn("No se pudo marcar el checklist tras importar", { error, academyIdTouched });
        }
      }
    }

    if (importBatchId) {
      await db
        .update(athleteImportBatches)
        .set({
          status: "completed",
          createdCount: summary.created,
          skippedCount: summary.skipped,
          completedAt: new Date(),
        })
        .where(eq(athleteImportBatches.id, importBatchId));

      try {
        await createAuditLog({
          tenantId: effectiveTenantId,
          userId: context.userId,
          action: "athletes.import",
          module: "athletes",
          resourceType: "athlete_import_batch",
          resourceId: importBatchId,
          resourceName: fileHash,
          description: `Importó ${summary.created} gimnastas desde un CSV`,
          meta: {
            batchId: importBatchId,
            totalRows: summary.total,
            createdCount: summary.created,
            skippedCount: summary.skipped,
            potentialDuplicates: summary.potentialDuplicates,
          },
        });
      } catch (auditError) {
        // El lote ya está cerrado; un fallo del registro no debe hacer creer
        // al owner que la importación falló ni repetir sus inserts.
        logger.warn("No se pudo registrar la importación en auditoría", { auditError, importBatchId });
      }
    }

    return apiSuccess(summary);
  } catch (error) {
    if (importBatchId) {
      try {
        await db
          .update(athleteImportBatches)
          .set({ status: "failed", failedAt: new Date() })
          .where(eq(athleteImportBatches.id, importBatchId));
      } catch (batchError) {
        logger.error("No se pudo cerrar el lote de importación", batchError);
      }
    }
    return handleApiError(error, { endpoint: "/api/athletes/import", method: "POST" });
  }
});

// Aplicar rate limiting y validación de payload
// Nota: withPayloadValidation espera NextRequest, pero withTenant usa Request
// Aplicamos validación de payload manualmente antes de withTenant
const handlerWithPayloadCheck = async (request: NextRequest) => {
  const validation = await validatePayloadSize(request, 10 * 1024 * 1024);
  
  if (!validation.valid) {
    const sizeMB = ((validation.size ?? 0) / (1024 * 1024)).toFixed(2);
    const maxSizeMB = ((validation.maxSize ?? 0) / (1024 * 1024)).toFixed(2);
    return NextResponse.json(
      {
        ok: false,
        error: "PAYLOAD_TOO_LARGE",
        message: `El payload es demasiado grande (${sizeMB}MB). Tamaño máximo permitido: ${maxSizeMB}MB`,
        size: validation.size,
        maxSize: validation.maxSize,
      },
      { status: 413 }
    );
  }
  
  return handler(request as unknown as Request, {} as any) as Promise<NextResponse>;
};

export const POST = withRateLimit(handlerWithPayloadCheck, { identifier: getUserIdentifier });
