import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu familia",
  description: "Horario, asistencia y cuotas de tus gimnastas.",
  robots: { index: false, follow: false },
};

export default function FamilyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
