import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({ items: [], total: 0 });
}

export async function POST() {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
}
