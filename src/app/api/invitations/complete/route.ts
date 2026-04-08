import { apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function POST() {
  return apiError("NOT_IMPLEMENTED", "No implementado", 501);
}
