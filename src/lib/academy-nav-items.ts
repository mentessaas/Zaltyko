import { getAcademyNavigation, type NavigationItem } from "@/lib/navigation/registry";
import type { MembershipRole, ProfileRole } from "@/lib/product/roles";

export type AcademyNavItem = NavigationItem;

export function getAcademyNavItems(
  academyId: string,
  profileRole: ProfileRole = "owner",
  membershipRole?: MembershipRole | null
): AcademyNavItem[] {
  return getAcademyNavigation({
    academyId,
    profileRole,
    membershipRole,
  });
}
