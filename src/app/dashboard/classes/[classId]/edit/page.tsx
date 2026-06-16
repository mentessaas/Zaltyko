import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { classes } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

interface EditClassPageProps {
  params: Promise<{ classId: string }>;
}

export default async function EditClassPage({ params }: EditClassPageProps) {
  const { classId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [classRow] = await db
    .select({
      id: classes.id,
      academyId: classes.academyId,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow) {
    notFound();
  }

  redirect(`/app/${classRow.academyId}/classes/${classRow.id}`);
}
