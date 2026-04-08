import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
}
