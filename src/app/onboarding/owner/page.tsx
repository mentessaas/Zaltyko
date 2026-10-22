import { redirect } from "next/navigation";

/** La creación owner legacy queda sustituida por el bootstrap canónico. */
export default function LegacyOwnerOnboardingRedirect() {
  redirect("/owner/setup");
}
