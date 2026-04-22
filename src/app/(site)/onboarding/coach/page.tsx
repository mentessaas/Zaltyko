import { redirect } from "next/navigation";

export default function LegacyCoachOnboardingPage() {
  redirect("/onboarding/owner");
}
