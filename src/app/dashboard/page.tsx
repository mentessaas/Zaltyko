import AccountForm from "./account-form";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function Dashboard() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AccountForm user={user} />;
}
