import { ConsentLink } from "@/components/directory/ConsentLink";
export const metadata = {
  title: "Confirmar solicitud | Zaltyko",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-12">
      <h1 className="text-3xl font-bold">Confirmar solicitud</h1>
      <ConsentLink
        id={params.id ?? ""}
        token={params.token ?? ""}
        withdraw={false}
      />
    </main>
  );
}
