/**
 * @deprecated Use /api/profile instead
 * This endpoint is deprecated for security reasons (uses service role directly without tenant isolation)
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "DEPRECATED",
      message: "This endpoint is deprecated. Use /api/profile instead.",
      code: "ENDPOINT_DEPRECATED",
    },
    { status: 410 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      error: "DEPRECATED",
      message: "This endpoint is deprecated. Use /api/profile instead.",
      code: "ENDPOINT_DEPRECATED",
    },
    { status: 410 }
  );
}
