export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { classWaitingList } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withTenant } from "@/lib/authz";

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { entryId?: string };
    const entryId = params?.entryId;

    if (!entryId) {
      return NextResponse.json({ error: "ENTRY_ID_REQUIRED" }, { status: 400 });
    }

    await db
      .delete(classWaitingList)
      .where(eq(classWaitingList.id, entryId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
});
