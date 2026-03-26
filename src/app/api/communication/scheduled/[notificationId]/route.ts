import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function DELETE() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
