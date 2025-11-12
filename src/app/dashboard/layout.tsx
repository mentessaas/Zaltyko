import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { RealtimeNotificationsProvider } from "@/components/providers/RealtimeNotificationsProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-zaltyko-neutral-light transition-all duration-300">
      <GlobalTopNav
        userRole={profile.role}
        userName={profile.name}
        userEmail={user.email ?? null}
        profileId={profile.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-4 transition-all duration-300 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <RealtimeNotificationsProvider userId={profile.userId} tenantId={profile.tenantId} />
        {children}
      </main>
    </div>
  );
}

