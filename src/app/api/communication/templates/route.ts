/**
 * Message Templates API
 * CRUD operations for message templates
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  createMessageTemplate,
  getMessageTemplates,
  getMessageTemplateById,
  updateMessageTemplate,
  deleteMessageTemplate,
  seedDefaultTemplates,
} from "@/lib/communication-service";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  channel: z.string().default("whatsapp"),
  templateType: z.string().default("custom"),
  subject: z.string().optional(),
  body: z.string().min(1, "Body is required"),
  variables: z.array(z.string()).default([]),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/templates - List all templates
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  try {
    const templates = await getMessageTemplates(context.tenantId, {
      channel: channel || undefined,
      includeInactive,
    });

    return NextResponse.json({
      items: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        channel: t.channel,
        templateType: t.templateType,
        subject: t.subject,
        body: t.body,
        variables: t.variables,
        isSystem: t.isSystem,
        isActive: t.isActive,
        usageCount: t.usageCount,
        createdAt: t.createdAt?.toISOString(),
        updatedAt: t.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching message templates:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// POST /api/communication/templates - Create a new template
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);

    const template = await createMessageTemplate({
      academyId: context.tenantId,
      ...validated,
      createdBy: context.profile.id,
    });

    return NextResponse.json({
      id: template.id,
      name: template.name,
      message: "Template creado correctamente",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error creating message template:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
