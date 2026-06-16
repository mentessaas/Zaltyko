import type { Metadata } from "next";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

export const metadata: Metadata = {
  title: "Directorio de Academias",
  description: "Encuentra academias de gimnasia artística y rítmica cerca de ti.",
};

export default function AcademiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
