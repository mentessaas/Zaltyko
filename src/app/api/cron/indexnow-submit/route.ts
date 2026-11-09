import { requireCronAuth } from "@/lib/cron-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { ESSENTIAL_PUBLIC_ROUTES } from "@/lib/launch/essential-routes";

// Submit set: the same finite public routes as the sitemap. Retired pages
// answer 404 or redirect, so asking search engines to re-crawl them would
// only spread dead URLs. Internal app routes are intentionally excluded.
//
// To trigger after a deploy from Vercel:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://zaltyko.com/api/cron/indexnow-submit
// Or schedule via vercel.json cron entry pointing at this route.
const PUBLIC_ROUTES = ESSENTIAL_PUBLIC_ROUTES;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const baseUrl = getPublicSiteUrl();
    const urls = PUBLIC_ROUTES.map((p) => `${baseUrl}${p}`);

    const result = await submitIndexNow(urls);

    logger.info("IndexNow submission completed", {
      urls: urls.length,
      accepted: result.accepted,
      status: result.status,
      error: result.error,
    });

    return apiSuccess({
      urlsSubmitted: urls.length,
      accepted: result.accepted,
      upstreamStatus: result.status,
      error: result.error ?? null,
    });
  } catch (error: unknown) {
    logger.error("IndexNow cron submission failed", error);
    return apiError("INDEXNOW_FAILED", "IndexNow submission failed", 500);
  }
}
