import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { announcements } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnnouncementDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [announcement] = await db
    .select({
      id: announcements.id,
      academyId: announcements.academyId,
    })
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);

  if (!announcement) {
    notFound();
  }

  redirect(`/app/${announcement.academyId}/announcements/${announcement.id}`);
}
