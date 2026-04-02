import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { redirect as redirectTo } from "next/navigation";

// Redireccionar al calendario principal del dashboard
export default async function ClassesCalendarPage() {
  redirect("/dashboard/calendar");
}
