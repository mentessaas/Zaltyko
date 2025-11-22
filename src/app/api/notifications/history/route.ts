import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { emailLogs } from "@/db/schema";

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const whereConditions = [eq(emailLogs.tenantId, context.tenantId)];
  if (academyId) {
    whereConditions.push(eq(emailLogs.academyId, academyId));
  }

  const logs = await db
    .select()
    .from(emailLogs)
    .where(and(...whereConditions))
    .orderBy(desc(emailLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: emailLogs.id })
    .from(emailLogs)
    .where(and(...whereConditions));

  return NextResponse.json({
    items: logs.map((log) => ({
      id: log.id,
      toEmail: log.toEmail,
      subject: log.subject,
      template: log.template,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt?.toISOString() || null,
      createdAt: log.createdAt?.toISOString(),
      metadata: log.metadata,
    })),
    total: total.length,
    limit,
    offset,
  });
});

