import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

config({path:".env.directory-local",override:true,quiet:true});
async function main() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if(new URL(url).hostname!=="127.0.0.1") throw new Error("Solo se permite el entorno local");
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
  const anonymous=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const outsider=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const fixtures=JSON.parse(readFileSync("output/directory/fixtures.json","utf8"));
  const credentials=fixtures.users["representative-two"];
  const auth=await outsider.auth.signInWithPassword({email:credentials.email,password:credentials.password});
  if(auth.error) throw new Error("No se pudo autenticar la cuenta local");
  const path=`qa-storage/${randomUUID()}.pdf`;
  try {
    const uploaded=await admin.storage.from("directory-evidence").upload(path,Buffer.from("%PDF-1.4\n% Documento ficticio QA\n%%EOF"),{contentType:"application/pdf"});
    if(uploaded.error) throw new Error("No se pudo preparar el documento privado ficticio");
    for(const client of [anonymous,outsider]) {
      const result=await client.storage.from("directory-evidence").download(path);
      if(!result.error || result.data) throw new Error("Acceso privado concedido indebidamente");
      const signed=await client.storage.from("directory-evidence").createSignedUrl(path,60);
      if(!signed.error || signed.data) throw new Error("Firma concedida indebidamente");
    }
    const signed=await admin.storage.from("directory-evidence").createSignedUrl(path,60);
    if(signed.error || !signed.data) throw new Error("Firma privada fallida");
    const response=await fetch(signed.data.signedUrl);
    if(!response.ok || !(await response.text()).startsWith("%PDF")) throw new Error("Lectura temporal fallida");
    console.log("Storage local: descarga y firma denegadas a anónimo y cuenta ajena; acceso firmado de 60 segundos válido. Documento ficticio retirado al finalizar.");
  } finally {
    const removed=await admin.storage.from("directory-evidence").remove([path]);
    if(removed.error) throw new Error("No se pudo retirar el documento ficticio");
  }
}
main().catch(() => {console.error("Comprobación local de Storage fallida; no se muestran claves ni enlaces privados.");process.exitCode=1;});
