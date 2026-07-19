import { Metadata } from "next";
import { JobForm } from "@/components/empleo/JobForm";

export const metadata: Metadata = {
  title: "Publicar oferta de empleo | Zaltyko",
  description: "Publica una nueva oferta de empleo para tu academia",
};

export default function NewEmpleoPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Publicar oferta de empleo</h1>
      <div className="max-w-2xl mx-auto">
        <JobForm />
      </div>
    </div>
  );
}
