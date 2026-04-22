import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Página no encontrada</h2>
        <p className="text-sm text-muted-foreground">
          La página que buscas no existe o fue eliminada.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="default">
            <Link href="/dashboard">Volver al inicio</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/academies">Ir a academias</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
