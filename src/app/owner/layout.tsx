import type { Metadata } from "next";

import { AddToHomeScreenHint } from "@/components/pwa/AddToHomeScreenHint";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu club",
  description: "Tu equipo, tus clases y el día a día de tu club.",
  robots: { index: false, follow: false },
};

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {/* Invitación discreta a añadir Zaltyko a la pantalla de inicio: solo
          en móvil, tras unas visitas y nunca en las pantallas de pasar lista. */}
      <AddToHomeScreenHint />
    </>
  );
}
