import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({ item: null });
}

export async function PATCH() {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
}

export async function DELETE() {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
}
