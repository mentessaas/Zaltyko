import { redirect } from "next/navigation";

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  void children;
  redirect("/features");
}
