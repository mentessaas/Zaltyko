import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mesa de dirección",
  description: "Estado operativo, financiero y de crecimiento de la academia.",
  robots: { index: false, follow: false },
};

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
