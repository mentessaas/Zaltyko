import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ item: null });
}

export async function PATCH() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
