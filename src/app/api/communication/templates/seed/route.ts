/**
 * Seed Default Templates API
 */

import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { seedDefaultTemplates } from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

// POST /api/communication/templates/seed - Seed default templates
export async function POST(request: Request, context: { tenantId?: string; profile?: { id: string } }) {
  // Get academy from URL
  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    await seedDefaultTemplates(academyId);
    return NextResponse.json({ message: "Templates por defecto creados" });
  } catch (error) {
    console.error("Error seeding templates:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
