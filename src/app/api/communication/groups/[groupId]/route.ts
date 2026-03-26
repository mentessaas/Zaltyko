/**
 * Single Message Group API
 * Get, update, delete a specific group
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  getMessageGroupById,
  updateMessageGroup,
  deleteMessageGroup,
} from "@/lib/communication-service";

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  groupType: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/groups/[groupId]
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const groupId = (context.params as { groupId?: string } | undefined)?.groupId;
  if (!groupId) {
    return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const group = await getMessageGroupById(groupId, context.tenantId);

    if (!group) {
      return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      groupType: group.groupType,
      memberIds: group.memberIds,
      config: group.config,
      memberCount: group.memberIds?.length || 0,
      createdAt: group.createdAt?.toISOString(),
      updatedAt: group.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching message group:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// PATCH /api/communication/groups/[groupId]
export const PATCH = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const groupId = (context.params as { groupId?: string } | undefined)?.groupId;
  if (!groupId) {
    return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = updateGroupSchema.parse(body);

    const existing = await getMessageGroupById(groupId, context.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
    }

    await updateMessageGroup(groupId, context.tenantId, validated);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error updating message group:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// DELETE /api/communication/groups/[groupId]
export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const groupId = (context.params as { groupId?: string } | undefined)?.groupId;
  if (!groupId) {
    return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const existing = await getMessageGroupById(groupId, context.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
    }

    await deleteMessageGroup(groupId, context.tenantId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting message group:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
