export function ownerDashboardScopeHref(
  path: string,
  organizationId: string,
  locationId: string | null
): string {
  const params = new URLSearchParams({ organizationId });
  if (locationId) params.set("locationId", locationId);
  return `${path}?${params.toString()}`;
}
