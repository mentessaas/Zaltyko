-- A reviewer can leave at most one rating per marketplace listing.
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ratings_listing_reviewer_uq
  ON public.marketplace_ratings (listing_id, reviewer_id);
