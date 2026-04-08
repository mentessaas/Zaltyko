import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess([], { total: 0 });
}

export async function POST() {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
}