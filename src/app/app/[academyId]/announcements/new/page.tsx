import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function NewAnnouncementPage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Anuncios", href: `/app/${academyId}/announcements` },
          { label: "Nuevo" },
        ]}
      />

      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-bold mb-6">Crear nuevo anuncio</h1>
        <AnnouncementForm
          open={true}
          onClose={() => {}}
          academyId={academyId}
          onSuccess={() => {}}
        />
      </div>
    </div>
  );
}