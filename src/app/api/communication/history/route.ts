/**
 * Message History API
 * Track all sent messages
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  createMessageHistory,
  getMessageHistory,
  updateMessageHistoryStatus,
} from "@/lib/communication-service";

const createHistorySchema = z.object({
  templateId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  channel: z.string().min(1, "Channel is required"),
  subject: z.string().optional(),
  body: z.string().min(1, "Body is required"),
  recipients: z.object({
    type: z.enum(["individual", "group", "broadcast"]),
    ids: z.array(z.string()),
    count: z.number(),
  }).optional(),
  status: z.string().default("pending"),
  externalIds: z.record(z.string()).optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/history - List message history
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  try {
    const history = await getMessageHistory(context.tenantId, {
      channel: channel || undefined,
      status: status || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return NextResponse.json({
      items: history.map((h) => ({
        id: h.id,
        templateId: h.templateId,
        groupId: h.groupId,
        channel: h.channel,
        subject: h.subject,
        body: h.body,
        recipients: h.recipients,
        status: h.status,
        sentAt: h.sentAt?.toISOString(),
        deliveredAt: h.deliveredAt?.toISOString(),
        failedAt: h.failedAt?.toISOString(),
        errorMessage: h.errorMessage,
        externalIds: h.externalIds,
        createdAt: h.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching message history:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// POST /api/communication/history - Record a new message
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = createHistorySchema.parse(body);

    const history = await createMessageHistory({
      academyId: context.tenantId,
      ...validated,
      senderId: context.profile.id,
    });

    return NextResponse.json({
      id: history.id,
      status: history.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error creating message history:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// PATCH /api/communication/history - Update message status
export const PATCH = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const historyId = url.searchParams.get("id");
  const status = url.searchParams.get("status");

  if (!historyId || !status) {
    return NextResponse.json({ error: "ID_AND_STATUS_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    await updateMessageHistoryStatus(historyId, status, {
      errorMessage: body.errorMessage,
      externalIds: body.externalIds,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating message history:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
