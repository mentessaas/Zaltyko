const LOGIN_NOTICE_CODES = new Set([
  "access_disabled",
  "callback_failed",
  "consent_invalid",
  "consent_record_failed",
]);

export function isLoginNoticeCode(value: string | undefined): boolean {
  return value !== undefined && LOGIN_NOTICE_CODES.has(value);
}
