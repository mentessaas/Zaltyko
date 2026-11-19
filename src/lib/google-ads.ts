/**
 * Compatibility exports only. Google Ads is intentionally fail-closed until
 * the app has a separate advertising-consent contract and a reviewed
 * revocation boundary. An ID or deployment flag alone cannot enable it.
 */
export function isGoogleAdsEnabled(): boolean {
  return false;
}

export function trackGoogleAdsConversion(
  _conversionLabel: string,
  _value?: number,
  _currency: string = "EUR",
  _transactionId?: string
): void {
  // Deliberate no-op while the advertising-consent contract is absent.
  void _conversionLabel;
  void _value;
  void _currency;
  void _transactionId;
}
