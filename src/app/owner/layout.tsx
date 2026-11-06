import type { Metadata } from "next";

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
  return children;
}
