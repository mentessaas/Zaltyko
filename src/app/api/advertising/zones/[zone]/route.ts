import { NextResponse } from "next/server";
import { db } from "@/db";
import { advertisements } from "@/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const { zone } = await params;
  const today = new Date().toISOString().split("T")[0];

  const ads = await db.select()
    .from(advertisements)
    .where(and(
      eq(advertisements.position, zone as any),
      eq(advertisements.isActive, true),
      lte(advertisements.startDate, today),
      gte(advertisements.endDate, today)
    ))
    .limit(10);

  return NextResponse.json({ ads });
}
