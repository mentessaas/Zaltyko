import { redirect } from "next/navigation";

/** La analítica owner canónica se explica desde el Health Score. */
export default function LegacyOwnerAnalyticsRedirect() {
  redirect("/owner#score");
}
