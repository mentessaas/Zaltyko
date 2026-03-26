/**
 * Single Message Template API
 * Get, update, delete a specific template
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  getMessageTemplateById,
  updateMessageTemplate,
  deleteMessageTemplate,
  incrementTemplateUsage,
} from "@/lib/communication-service";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  channel: z.string().optional(),
  templateType: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/templates/[templateId]
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const templateId = (context.params as { templateId?: string } | undefined)?.templateId;
  if (!templateId) {
    return NextResponse.json({ error: "TEMPLATE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const template = await getMessageTemplateById(templateId, context.tenantId);

    if (!template) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      channel: template.channel,
      templateType: template.templateType,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      isSystem: template.isSystem,
      isActive: template.isActive,
      usageCount: template.usageCount,
      createdAt: template.createdAt?.toISOString(),
      updatedAt: template.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching message template:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// PATCH /api/communication/templates/[templateId]
export const PATCH = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const templateId = (context.params as { templateId?: string } | undefined)?.templateId;
  if (!templateId) {
    return NextResponse.json({ error: "TEMPLATE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = updateTemplateSchema.parse(body);

    const existing = await getMessageTemplateById(templateId, context.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    await updateMessageTemplate(templateId, context.tenantId, validated);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error updating message template:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// DELETE /api/communication/templates/[templateId]
export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const templateId = (context.params as { templateId?: string } | undefined)?.templateId;
  if (!templateId) {
    return NextResponse.json({ error: "TEMPLATE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const existing = await getMessageTemplateById(templateId, context.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    // Don't allow deleting system templates
    if (existing.isSystem) {
      return NextResponse.json({ error: "CANNOT_DELETE_SYSTEM_TEMPLATE" }, { status: 400 });
    }

    await deleteMessageTemplate(templateId, context.tenantId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting message template:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
