import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoSandbox } from "@/components/demo/DemoSandbox";

/*
 * SEO: toda la demo va con noindex y sin entrar en el sitemap.
 *  - No aporta contenido propio: son pantallas de la aplicación con datos
 *    ficticios y casi sin texto, que un buscador leería como contenido fino.
 *  - Duplica lo que ya explican /features y /pricing, y repartiría la señal
 *    entre ocho URL casi iguales.
 *  - Lo que sí tiene valor es que la gente llegue a ella desde la home y los
 *    precios: por eso `follow` se mantiene y el enlace sigue sumando.
 */
export const metadata: Metadata = {
  title: "Demo de Zaltyko: una academia de gimnasia de ejemplo",
  description:
    "Recorre Zaltyko sin registrarte: resumen, clases, asistencia, gimnastas, cuotas y portal de familia con datos ficticios.",
  robots: { index: false, follow: true },
};

// El banner ocupa 2,75 rem (h-11). El lateral fijo y la cabecera pegajosa del
// panel real arrancan en 0, así que aquí se bajan esa misma altura.
const DEMO_LAYOUT_CSS = `
[data-demo-root] [data-owner-sidebar]{top:2.75rem}
@media (min-width:1280px){[data-demo-root] header[class*="xl:sticky"]{top:2.75rem}}
`;

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoSandbox>
      <style>{DEMO_LAYOUT_CSS}</style>
      <DemoBanner />
      {children}
    </DemoSandbox>
  );
}
