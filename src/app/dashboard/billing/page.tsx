import { redirect } from "next/navigation";

export default function LegacyDashboardBillingPage() {
  redirect("/auth/login");
}