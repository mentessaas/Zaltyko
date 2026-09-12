import { getSuperAdminNavigation } from "@/lib/navigation/registry";

/**
 * Single source of truth for the Super Admin sidebar.
 * The top navigation and sidebar now render the same registry.
 */
export const SUPER_ADMIN_NAV_ITEMS = getSuperAdminNavigation();
