import { redirect } from "next/navigation";

/**
 * Corte deliberado del dashboard owner heredado.
 *
 * El identificador legacy de academia no se traduce ni se acepta como prueba
 * de acceso. `/owner` vuelve a resolver organización y sede desde el usuario
 * autenticado contra el modelo canónico.
 */
export default function LegacyAcademyDashboardRedirect() {
  redirect("/owner");
}
