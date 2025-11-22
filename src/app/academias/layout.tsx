import type { Metadata } from "next";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

export const metadata: Metadata = {
  title: "Directorio de Academias | Zaltyko",
  description: "Encuentra academias de gimnasia cerca de ti. Directorio público de academias de gimnasia artística, rítmica, trampolín y más.",
};

export default function AcademiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zaltyko-primary-dark">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

