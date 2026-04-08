import { apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({ items: [], total: 0 });
}
