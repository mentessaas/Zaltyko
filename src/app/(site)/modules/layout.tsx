import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

export default function ModulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20">{children}</main>
      <Footer />
    </div>
  );
}

