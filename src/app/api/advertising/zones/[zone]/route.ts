import { apiSuccess } from "@/lib/api-response";
import { listActivePublicAds } from "@/lib/advertising/public-ads";

// @route-auth public
export async function GET(
  request: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const { zone } = await params;
  const ads = await listActivePublicAds(zone);

  return apiSuccess({ ads });
}
