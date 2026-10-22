import { notFound } from "next/navigation";
import { flag } from "@/lib/directory/contracts";
import { MyListings } from "@/components/directory/MyListings";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Mis fichas | Zaltyko",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (!flag("catalog")) notFound();
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">Mis fichas</h1>
      <MyListings communicationsEnabled={flag("communications")} />
    </main>
  );
}
