import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiCreated, apiError } from "@/lib/api-response";
import { SANDBOX_CATALOG, SandboxMigrationError, type FieldMapping } from "@/lib/migration/sandbox";
import { sandboxMigrationStore } from "@/lib/migration/sandbox-registry";

const rowSchema = z.record(z.string(), z.union([z.string(), z.null()]).optional());
const previewSchema = z.object({
  academyId: z.string().uuid(),
  module: z.enum(["athletes", "debts"]),
  rows: z.array(rowSchema).min(1).max(10_000),
  headers: z.array(z.string()).optional(),
  mapping: z.record(z.string(), z.string().nullable()).optional(),
  expectedTotals: z.object({
    charges: z.number(),
    payments: z.number(),
    refunds: z.number(),
    openingBalance: z.number(),
  }).optional(),
});

const canOperateSandbox = new Set(["owner", "admin", "super_admin"]);

export const runtime = "nodejs";

export const POST = withTenant(async (request, context) => {
  if (!canOperateSandbox.has(context.profile.role)) {
    return apiError("PERMISSION_DENIED", "Solo owner o admin puede operar una migración sandbox.", 403);
  }
  try {
    const payload = previewSchema.parse(await request.json());
    const job = sandboxMigrationStore.create({
      tenantId: context.tenantId,
      academyId: payload.academyId,
      actor: { id: context.userId, role: context.profile.role as "owner" | "admin" | "super_admin" },
      module: payload.module,
      rows: payload.rows,
      headers: payload.headers,
      mapping: payload.mapping as unknown as FieldMapping | undefined,
      catalog: SANDBOX_CATALOG,
      expectedTotals: payload.expectedTotals,
      synthetic: true,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
      requestId: request.headers.get("X-Request-Id") ?? undefined,
    });
    return apiCreated(job);
  } catch (error) {
    if (error instanceof SandboxMigrationError) return apiError(error.code, error.message, error.status);
    if (error instanceof z.ZodError) return apiError("VALIDATION_ERROR", "Payload de migración inválido.", 422);
    return apiError("SANDBOX_INTERNAL_ERROR", "No se pudo generar el preview sandbox.", 500);
  }
});
