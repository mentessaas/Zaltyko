export function canAccessFamilyFinancialData(profileRole: string): boolean {
  return profileRole === "parent";
}
