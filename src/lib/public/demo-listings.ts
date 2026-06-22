export const demoMarketplaceListing = {
  id: "demo-marketplace",
  sellerType: "academy",
  type: "product",
  category: "equipment",
  title: "Pack demo de material de entrenamiento",
  description: "Ficha demo para verificar la página pública de marketplace sin depender de datos remotos.",
  priceCents: 4900,
  currency: "eur",
  priceType: "fixed",
  status: "active",
  isFeatured: true,
  images: [],
  contact: { email: "hola@zaltyko.com" },
  location: { country: "España", province: "Madrid", city: "Madrid" },
  views: 0,
  createdAt: new Date().toISOString(),
};

export const demoEmploymentListing = {
  id: "demo-empleo",
  academyId: null,
  userId: null,
  title: "Entrenador/a de gimnasia - demo",
  category: "coach",
  description: "Oferta demo para verificar la página pública de empleo sin depender de datos remotos.",
  requirements: "Experiencia entrenando grupos base y disponibilidad de tardes.",
  location: { country: "España", province: "Madrid", city: "Madrid" },
  jobType: "part_time",
  salary: { min: 900, max: 1200, currency: "eur", type: "range" },
  howToApply: "external",
  externalUrl: "mailto:hola@zaltyko.com",
  deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  status: "active",
  createdAt: new Date().toISOString(),
};

export function canUsePublicDemoData(id?: string) {
  return process.env.NODE_ENV !== "production" && Boolean(id?.startsWith("demo-"));
}
