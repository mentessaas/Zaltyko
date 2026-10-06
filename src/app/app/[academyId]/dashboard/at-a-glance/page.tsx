import { redirect } from "next/navigation";

/**
 * La vista owner "at a glance" quedó sustituida por `/owner` y su bandeja de
 * insights. Las reglas operativas reutilizables se conservan documentadas,
 * pero esta ruta ya no consulta el modelo `public.*` heredado.
 */
export default function LegacyOwnerAtAGlanceRedirect() {
  redirect("/owner");
}
