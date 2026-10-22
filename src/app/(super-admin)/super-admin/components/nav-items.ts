import { getSuperAdminNavigation } from "@/lib/navigation/registry";

// La navegación del panel se define en un único registro compartido con el
// header global; así desktop, tablet y móvil no pueden divergir.
export const SUPER_ADMIN_NAV_ITEMS = getSuperAdminNavigation();
