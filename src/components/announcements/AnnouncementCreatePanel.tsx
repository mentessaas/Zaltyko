"use client";

import { useRouter } from "next/navigation";

import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";

interface AnnouncementCreatePanelProps {
  academyId: string;
}

/**
 * Punto de entrada cliente de la ruta `/announcements/new`.
 *
 * La pagina que lo renderiza es un Server Component, asi que los callbacks
 * que necesita `AnnouncementForm` deben vivir aqui y no viajar desde el
 * servidor: React prohibe pasar event handlers a un Client Component.
 */
export function AnnouncementCreatePanel({ academyId }: AnnouncementCreatePanelProps) {
  const router = useRouter();
  const returnToList = () => router.push(`/app/${academyId}/announcements`);

  return (
    <AnnouncementForm
      open
      onClose={returnToList}
      academyId={academyId}
      onSuccess={returnToList}
    />
  );
}
