"use client";

/**
 * Google Ads remains disabled until the app has a separate advertising-consent
 * contract and a safe revocation boundary. Keep this export as a no-op so
 * existing imports cannot load gtag or emit conversions in the meantime.
 */
export function GoogleAdsTracking(_props: { nonce?: string }) {
  void _props;
  return null;
}

export {
  trackGoogleAdsConversion,
  isGoogleAdsEnabled,
} from "@/lib/google-ads";
