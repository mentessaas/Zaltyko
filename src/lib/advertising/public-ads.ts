import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { advertisements } from "@/db/schema";
import { adPositionEnum } from "@/db/schema/enums";

export type PublicAdBannerItem = {
  id: string;
  type: string;
  imageUrl?: string;
  linkUrl: string;
  title: string;
  altText?: string;
};

/** Active, date-valid advertisements for a public placement. */
export async function listActivePublicAds(zone: string) {
  const position = adPositionEnum.enumValues.find((value) => value === zone);
  if (!position) return [];
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(advertisements)
    .where(
      and(
        eq(advertisements.position, position),
        eq(advertisements.isActive, true),
        lte(advertisements.startDate, today),
        gte(advertisements.endDate, today)
      )
    )
    .limit(10);
}

export function toPublicAdBannerItems(
  ads: Awaited<ReturnType<typeof listActivePublicAds>>
): PublicAdBannerItem[] {
  return ads.map((ad) => ({
    id: ad.id,
    type: ad.type,
    imageUrl: ad.imageUrl ?? undefined,
    linkUrl: ad.linkUrl,
    title: ad.title,
    altText: ad.altText ?? undefined,
  }));
}
