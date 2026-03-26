import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ items: [], total: 0 });
}

export async function POST() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
