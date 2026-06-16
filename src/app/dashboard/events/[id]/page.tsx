import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [eventRow] = await db
    .select({
      id: events.id,
      academyId: events.academyId,
    })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);

  if (!eventRow) {
    notFound();
  }

  redirect(`/app/${eventRow.academyId}/events/${eventRow.id}`);
}
