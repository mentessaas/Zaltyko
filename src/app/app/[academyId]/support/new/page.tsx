import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketForm } from "@/components/support/TicketForm";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export default async function NewTicketPage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verificar que el usuario tiene acceso a la academia
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("academy_id", academyId)
    .single();

  if (!membership) {
    redirect("/dashboard");
  }

  async function handleSubmit(formData: any) {
    "use server";
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("No autorizado");
    }

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
      .limit(1);

    if (!profile || !membership) {
      throw new Error("No tienes acceso a esta academia");
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        status: "open",
        created_by: profile.id,
        academy_id: academyId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/app/${academyId}/support/${ticket.id}`);
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <TicketForm academyId={academyId} onSubmit={handleSubmit} />
    </div>
  );
}
