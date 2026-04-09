import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get current user's profile
  const [profile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      photoUrl: profiles.photoUrl,
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
          fullName: profile.name || undefined,
          avatarUrl: profile.photoUrl || undefined,
        }}
      />
    </div>
  );
}
