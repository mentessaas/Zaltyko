import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { conversationParticipants } from "@/db/schema/direct-messages";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
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
    redirect("/auth/login");
  }

  // Verify user has access to this conversation
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, profile.id)
      )
    )
    .limit(1);

  if (!participant) {
    // User doesn't have access - redirect to messages list
    redirect("/dashboard/messages");
  }

  redirect(`/dashboard/messages?c=${conversationId}`);
}
