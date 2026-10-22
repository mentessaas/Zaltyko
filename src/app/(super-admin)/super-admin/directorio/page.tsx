import { notFound } from "next/navigation";
import { flag } from "@/lib/directory/contracts";
import { AdminDirectory } from "@/components/directory/AdminDirectory";
export const metadata = { title: "Directorio | Super Admin" };
export default function Page() {
  if (!flag("admin")) notFound();
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Directorio</h1>
      <AdminDirectory />
    </div>
  );
}
