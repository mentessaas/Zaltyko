import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

interface AthletePageProps {
  params: Promise<{
    athleteId: string;
  }>;
}

export default async function AthleteDetailPage({ params }: AthletePageProps) {
  const { athleteId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [athlete] = await db
    .select({
      id: athletes.id,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete) {
    notFound();
  }

  redirect(`/app/${athlete.academyId}/athletes/${athlete.id}`);
}
