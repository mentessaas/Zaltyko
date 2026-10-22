import Link from "next/link";
import { notFound } from "next/navigation";
import { flag } from "@/lib/directory/contracts";
import { ProposeEntry } from "@/components/directory/ProposeEntry";
export const metadata = {
  title: "Proponer una ficha | Zaltyko",
  robots: { index: false, follow: true },
};
export default function Page() {
  if (!flag("catalog")) notFound();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <h1 className="text-3xl font-bold">Proponer una ficha</h1>
      <p>
        Necesitas{" "}
        <Link className="underline" href="/login?next=%2Fdirectorio%2Fproponer">
          iniciar sesión
        </Link>{" "}
        y confirmar tu correo. Proponer una ficha no te convierte en
        representante.
      </p>
      <ProposeEntry />
    </main>
  );
}
