import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function SuperAdminNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-12">
      <section className="w-full rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/70">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold text-white">
          Recurso no encontrado
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Puede que se haya eliminado o que ya no tengas acceso a este registro.
        </p>
        <Button asChild variant="outline" className="mt-6 gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10">
          <Link href="/super-admin/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al dashboard
          </Link>
        </Button>
      </section>
    </main>
  );
}
