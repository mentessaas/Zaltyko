import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { redirect } from "next/navigation";
import { MessagesPage as MessagesPageComponent } from "@/components/messages/MessagesPage";

export const metadata = {
  title: "Mensajes | Zaltyko",
  description: "Gestiona tus conversaciones y mensajes",
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get current user's profile
  const [profile] = await db
    .select({
      id: sql<string>`id`,
      fullName: sql<string>`full_name`,
      avatarUrl: sql<string>`avatar_url`,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="h-[calc(100vh-4rem)]">
      <MessagesPageComponent
        currentUserId={profile.id}
        currentUserProfile={{
          fullName: profile.fullName || undefined,
          avatarUrl: profile.avatarUrl || undefined,
        }}
      />
    </div>
  );
}
