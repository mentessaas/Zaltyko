// Positive: page calls supabase.auth.getUser directly. No parent layout
// is required because the page itself authenticates.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return <div>admin ok</div>;
}
