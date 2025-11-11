import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes } from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { withTenant } from "@/lib/authz";
import { assertWithinPlanLimits } from "@/lib/limits";

const CsvRowSchema = z.object({
  name: z.string().min(1),
  academyId: z.string().uuid(),
  dob: z.string().optional(),
  level: z.string().optional(),
  status: z.enum(athleteStatusOptions).optional(),
});

type CsvRow = z.infer<typeof CsvRowSchema>;

export const runtime = "nodejs";

export const POST = withTenant(async (request, context) => {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvText = buffer.toString("utf-8");

  if (!csvText.trim()) {
    return NextResponse.json({ error: "EMPTY_FILE" }, { status: 400 });
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
      };
      return CsvRowSchema.parse(normalized);
    });
  } catch (error) {
    console.error("CSV parse error", error);
    return NextResponse.json({ error: "INVALID_CSV" }, { status: 400 });
  }

  const tenantOverride = formData.get("tenantId");
  const effectiveTenantId =
    context.tenantId ?? (typeof tenantOverride === "string" ? tenantOverride : null);

  if (!effectiveTenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const academyIds = Array.from(new Set(records.map((row) => row.academyId)));

  const academiesRows = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.tenantId, effectiveTenantId), inArray(academies.id, academyIds)));

  const validAcademyIds = new Set(academiesRows.map((row) => row.id));

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

      await db.insert(athletes).values({
        id: crypto.randomUUID(),
        tenantId: effectiveTenantId,
        academyId: record.academyId,
        name: record.name,
        dob: record.dob ? new Date(record.dob) : null,
        level: record.level ?? null,
        status: record.status ?? "active",
      });

      summary.created += 1;
    } catch (error) {
      console.error("Import athlete error", error);
      summary.skipped += 1;
      summary.errors.push({
        row: index + 2,
        reason: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json(summary);
});


