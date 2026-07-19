import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { db } from "@/db";
import { academies, athleteSportConfigs, athletes, groupAthletes, groups } from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { withTenant } from "@/lib/authz";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { validatePayloadSize } from "@/lib/payload-validator";
import { NextRequest } from "next/server";
import { validateDateWithError, formatDateForDB } from "@/lib/validation/date-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.string().uuid().optional());

const CsvRowSchema = z.object({
  name: z.string().min(1),
  academyId: z.string().uuid(),
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
  try {
    const formData = await request.formData();
    const file = (formData as unknown as { get(name: string): File | null }).get("file");

  if (!(file instanceof File)) {
    return apiError("FILE_REQUIRED", "File is required", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvText = buffer.toString("utf-8");

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
  const effectiveTenantId =
    context.tenantId ?? (typeof tenantOverride === "string" ? tenantOverride : null);

  if (!effectiveTenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const academyIds = Array.from(new Set(records.map((row) => row.academyId)));

  const academiesRows = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.tenantId, effectiveTenantId), inArray(academies.id, academyIds)));

  const validAcademyIds = new Set(academiesRows.map((row) => row.id));
  const configsByAcademy = new Map<string, Awaited<ReturnType<typeof getAcademySportConfigOptions>>>();

  const summary = {
    total: records.length,
    created: 0,
    skipped: 0,
    errors: [] as Array<{ row: number; reason: string }>,
  };

  for (const [index, record] of records.entries()) {
    if (!validAcademyIds.has(record.academyId)) {
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: `Academia ${record.academyId} no pertenece al tenant.`,
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

      const athleteId = crypto.randomUUID();

      await db.insert(athletes).values({
        id: athleteId,
        tenantId: effectiveTenantId,
        academyId: record.academyId,
        name: record.name,
        dob: dobDate ? formatDateForDB(dobDate) : null,
        level: record.level ?? null,
        status: record.status ?? "active",
        groupId: selectedGroup?.id ?? null,
        primarySportConfigId: effectiveSportConfigId,
        programCode: effectiveProgramCode,
        levelCode: effectiveLevelCode,
        categoryCode: effectiveCategoryCode,
      });

      if (selectedGroup) {
        await db
          .insert(groupAthletes)
          .values({
            id: crypto.randomUUID(),
            tenantId: effectiveTenantId,
            groupId: selectedGroup.id,
            athleteId,
          })
          .onConflictDoNothing();
      }

      if (effectiveSportConfigId) {
        await db
          .insert(athleteSportConfigs)
          .values({
            id: crypto.randomUUID(),
            tenantId: effectiveTenantId,
            athleteId,
            academySportConfigId: effectiveSportConfigId,
            programCode: effectiveProgramCode,
            levelCode: effectiveLevelCode,
            categoryCode: effectiveCategoryCode,
          })
          .onConflictDoNothing();
      }

      summary.created += 1;
    } catch (error) {
      logger.error("Import athlete error", error);
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

    return apiSuccess(summary);
  } catch (error) {
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

