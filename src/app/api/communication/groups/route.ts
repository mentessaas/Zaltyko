/**
 * Message Groups API
 * CRUD operations for message groups
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  createMessageGroup,
  getMessageGroups,
  getMessageGroupById,
  updateMessageGroup,
  deleteMessageGroup,
} from "@/lib/communication-service";

const createGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  groupType: z.string().default("custom"),
  memberIds: z.array(z.string()).default([]),
  config: z.record(z.unknown()).optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/groups - List all groups
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const groups = await getMessageGroups(context.tenantId);

    return NextResponse.json({
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        groupType: g.groupType,
        memberIds: g.memberIds,
        config: g.config,
        memberCount: g.memberIds?.length || 0,
        createdAt: g.createdAt?.toISOString(),
        updatedAt: g.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching message groups:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// POST /api/communication/groups - Create a new group
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = createGroupSchema.parse(body);

    const group = await createMessageGroup({
      academyId: context.tenantId,
      ...validated,
      createdBy: context.profile.id,
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      message: "Grupo creado correctamente",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error creating message group:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
