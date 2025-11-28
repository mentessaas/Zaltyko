import type { Metadata } from "next";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

export const metadata: Metadata = {
  title: "Directorio Público | Zaltyko",
  description: "Directorio público de eventos y competencias de gimnasia.",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20">{children}</main>
      <Footer />
    </div>
  );
}

