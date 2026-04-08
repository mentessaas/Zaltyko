import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { eq, sql, and } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { conversationParticipants, conversations } from "@/db/schema/direct-messages";
import { redirect, notFound } from "next/navigation";
import { MessagesPage } from "@/components/messages/MessagesPage";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;

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

  return (
    <div className="h-[calc(100vh-4rem)]">
      <MessagesPage
        currentUserId={profile.id}
        currentUserProfile={{
          fullName: profile.fullName || undefined,
          avatarUrl: profile.avatarUrl || undefined,
        }}
      />
    </div>
  );
}
