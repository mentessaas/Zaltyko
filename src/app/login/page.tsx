import { redirect } from "next/navigation";
import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";
export default async function LegacyLoginPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const params=await searchParams;const next=getSafeAuthNextPath(params.next??params.callbackUrl??null);redirect(`/auth/login?next=${encodeURIComponent(next)}`);}
