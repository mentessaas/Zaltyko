import { Metadata } from "next";
import { MarketplaceForm } from "@/components/marketplace/MarketplaceForm";

export const metadata: Metadata = {
  title: "Nuevo producto/servicio | Zaltyko",
  description: "Publica un nuevo producto o servicio en el marketplace",
};

export default function NewMarketplacePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Publicar producto o servicio</h1>
      <div className="max-w-2xl mx-auto">
        <MarketplaceForm />
      </div>
    </div>
  );
}
