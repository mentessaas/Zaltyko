export type EnrollmentDateWindow = {
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function isEnrollmentStartDateAllowed(
  startsOn: string,
  window: EnrollmentDateWindow
): boolean {
  return Boolean(
    startsOn &&
      startsOn >= window.effectiveFrom &&
      (!window.effectiveTo || startsOn <= window.effectiveTo)
  );
}

export function constrainEnrollmentStartDate(
  startsOn: string,
  window: EnrollmentDateWindow
): string {
  if (!startsOn) return "";
  if (startsOn < window.effectiveFrom) return window.effectiveFrom;
  if (window.effectiveTo && startsOn > window.effectiveTo) {
    return window.effectiveTo;
  }
  return startsOn;
}
