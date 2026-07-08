import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
}

export const GET = unauthorized;
export const POST = unauthorized;
export const PUT = unauthorized;
export const PATCH = unauthorized;
export const DELETE = unauthorized;