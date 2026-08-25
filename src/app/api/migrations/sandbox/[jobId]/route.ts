import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { SandboxMigrationError } from "@/lib/migration/sandbox";
import { sandboxMigrationStore } from "@/lib/migration/sandbox-registry";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve"), decisions: z.record(z.coerce.number(), z.enum(["create", "link_existing", "omit"])) }),
  z.object({ action: z.literal("commit") }),
  z.object({ action: z.literal("rollback") }),
  z.object({ action: z.literal("export"), module: z.enum(["athletes", "families", "debts", "payments", "notes", "audit"]) }),
]);

const canOperateSandbox = new Set(["owner", "admin", "super_admin"]);

async function assertScope(request: Request, context: { tenantId: string; profile: { role: string } }) {
  const academyId = new URL(request.url).searchParams.get("academyId");
  if (!academyId) return { ok: false as const, response: apiError("ACADEMY_REQUIRED", "academyId es requerido.", 400) };
  return { ok: true as const, scope: { tenantId: context.tenantId, academyId } };
}

export const runtime = "nodejs";

export const GET = withTenant(async (request, context) => {
  if (!canOperateSandbox.has(context.profile.role)) return apiError("PERMISSION_DENIED", "No tienes permiso para consultar migraciones sandbox.", 403);
  const scoped = await assertScope(request, context);
  if (!scoped.ok) return scoped.response;
  const jobId = (context.params as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== "string") return apiError("JOB_ID_REQUIRED", "jobId es requerido.", 400);
  try {
    return apiSuccess(sandboxMigrationStore.get(jobId, scoped.scope));
  } catch (error) {
    if (error instanceof SandboxMigrationError) return apiError(error.code, error.message, error.status);
    return apiError("SANDBOX_INTERNAL_ERROR", "No se pudo consultar el job sandbox.", 500);
  }
});

export const POST = withTenant(async (request, context) => {
  if (!canOperateSandbox.has(context.profile.role)) return apiError("PERMISSION_DENIED", "No tienes permiso para operar migraciones sandbox.", 403);
  const scoped = await assertScope(request, context);
  if (!scoped.ok) return scoped.response;
  const jobId = (context.params as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== "string") return apiError("JOB_ID_REQUIRED", "jobId es requerido.", 400);
  try {
    const action = actionSchema.parse(await request.json());
    if (action.action === "resolve") return apiSuccess(sandboxMigrationStore.resolve(jobId, action.decisions, scoped.scope));
    if (action.action === "commit") return apiSuccess(sandboxMigrationStore.commit(jobId, scoped.scope));
    if (action.action === "rollback") return apiSuccess(sandboxMigrationStore.rollback(jobId, scoped.scope));
    return apiSuccess(sandboxMigrationStore.export(jobId, action.module, scoped.scope));
  } catch (error) {
    if (error instanceof SandboxMigrationError) return apiError(error.code, error.message, error.status);
    if (error instanceof z.ZodError) return apiError("VALIDATION_ERROR", "Acción sandbox inválida.", 422);
    return apiError("SANDBOX_INTERNAL_ERROR", "No se pudo operar el job sandbox.", 500);
  }
});
