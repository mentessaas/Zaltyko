import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageGroupById, updateMessageGroup, deleteMessageGroup } from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  recipientCount: z.number().int().min(0).optional(),
});

export const GET = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const group = await getMessageGroupById(groupId);

  if (!group) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  if (group.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  return apiSuccess({
    id: group.id,
    name: group.name,
    description: group.description,
    recipientCount: group.recipientCount,
    createdAt: group.createdAt?.toISOString(),
  });
});

export const PATCH = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const existing = await getMessageGroupById(groupId);

  if (!existing) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  if (existing.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  try {
    const body = await request.json();
    const validated = updateGroupSchema.parse(body);

    const group = await updateMessageGroup(groupId, validated);

    if (!group) {
      return apiError("NOT_FOUND", "Group not found", 404);
    }

    return apiSuccess({
      id: group.id,
      name: group.name,
      description: group.description,
      recipientCount: group.recipientCount,
      createdAt: group.createdAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    console.error("Error updating group:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});

export const DELETE = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const existing = await getMessageGroupById(groupId);

  if (!existing) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  if (existing.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const deleted = await deleteMessageGroup(groupId);

  if (!deleted) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  return apiSuccess({ ok: true });
});
