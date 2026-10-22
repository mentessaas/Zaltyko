import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-2xl font-semibold">Página no encontrada</h2>
        <p className="text-gray-600">
          La página que estás buscando no existe o ha sido movida.
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ir al inicio
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Ir al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

