import type { Metadata } from "next";
import Link from "next/link";

import { SystemStatusPage, systemPageUi } from "@/components/system/SystemStatusPage";

// 404s nunca deben indexarse. `nocache: true` ademas bloquea caches que
// podrian servir la pagina 404 desde un crawl siguiente.
export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      "max-snippet": -1,
    },
  },
};

export default function NotFound() {
  return (
    <SystemStatusPage
      code="404"
      title="Página no encontrada"
      description={<p>La página que estás buscando no existe o ha sido movida.</p>}
      actions={
        <>
          <Link href="/" className={systemPageUi.primary}>
            Ir al inicio
          </Link>
          <Link href="/dashboard" className={systemPageUi.outline}>
            Ir al dashboard
          </Link>
        </>
      }
    />
  );
}
