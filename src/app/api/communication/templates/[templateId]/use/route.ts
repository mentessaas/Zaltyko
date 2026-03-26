/**
 * Increment Template Usage API
 */

import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import {
  getMessageTemplateById,
  incrementTemplateUsage,
} from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

// PUT /api/communication/templates/[templateId]/use - Increment usage count
export async function PUT(request: Request, context: { params?: { templateId?: string } }) {
  // Get tenant from request context (we need to parse the URL)
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const templateIndex = pathParts.indexOf("templates");
  const templateId = templateIndex !== -1 ? pathParts[templateIndex + 1] : undefined;

  if (!templateId) {
    return NextResponse.json({ error: "TEMPLATE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    // Get academy from query param or header
    const academyId = url.searchParams.get("academyId");

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    const existing = await getMessageTemplateById(templateId, academyId);
    if (!existing) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    await incrementTemplateUsage(templateId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error incrementing template usage:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
