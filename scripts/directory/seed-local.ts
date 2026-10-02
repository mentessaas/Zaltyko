import { config } from "dotenv";
import { randomBytes,randomUUID } from "node:crypto";
import { writeFileSync,mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
config({path:'.env.directory-local',override:true,quiet:true});
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(new URL(url).hostname!=='127.0.0.1')throw new Error('Only local sandbox allowed');
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!);const {db}=await import('../../src/db');const {sql}=await import('drizzle-orm');const {createEntry,setPublication}=await import('../../src/lib/directory/service');
 const roles=['super_admin','representative-one','representative-two','owner','admin','coach','parent','athlete'] as const;
 const fixtures:Record<string,{id:string;email:string;password:string}>={};
 const tenant=randomUUID();mkdirSync('output/directory',{recursive:true});
 for(const role of roles){const email=`e2e-directory-${role}@zaltyko.test`,password=randomBytes(24).toString('base64url')+'Aa1!';
  const existing=(await admin.auth.admin.listUsers({perPage:1000})).data.users.find(u=>u.email===email);
  let userId=existing?.id;if(!userId){const{data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`QA ${role}`,directory_account:role.startsWith('representative')},app_metadata:{e2eRole:role}});if(error||!data.user)throw new Error('Local Auth provisioning failed');userId=data.user.id;}else{const{error}=await admin.auth.admin.updateUserById(userId,{password});if(error)throw error;}
  fixtures[role]={id:userId,email,password};
  if(!role.startsWith('representative'))await db.execute(sql`INSERT INTO profiles(user_id,tenant_id,name,role,can_login,is_suspended) VALUES(${userId}::uuid,${tenant}::uuid,${`QA ${role}`},${role},true,false) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,can_login=true,is_suspended=false`);
  const cookies:{name:string;value:string;options:Record<string,unknown>}[]=[];const browser=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:values=>{for(const value of values)cookies.push(value as typeof cookies[number]);}}});
  const {error}=await browser.auth.signInWithPassword({email,password});if(error)throw new Error(`Local sign-in failed: ${role}`);
  writeFileSync(`output/directory/${role}-state.json`,JSON.stringify({cookies:cookies.map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'})),origins:[]}),{mode:0o600});
 }
 const actor=fixtures.super_admin.id;
 const data={name:'Academia ficticia QA Directorio',countryCode:'ES',city:'Madrid',description:'Ficha inventada exclusivamente para pruebas locales. No es una academia real.',sourceName:'Fuente ficticia de QA',sourceUrl:'https://example.org/qa'};
 const entry=(await createEntry('academy',data,actor))!;await setPublication(entry.id,actor,'published');
 const event=(await createEntry('event',{...data,name:'Competición ficticia QA Directorio',startDate:'2027-03-02',endDate:'2027-03-03',organizerName:'Organizador ficticio de QA',eventStatus:'confirmed'},actor))!;await setPublication(event.id,actor,'published');
 writeFileSync('output/directory/fixtures.json',JSON.stringify({users:fixtures,academyId:entry.id,eventId:event.id}),{mode:0o600});console.log('Local fixtures prepared: 8 authenticated accounts, 2 fictional public entries; no remote writes or emails.');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Local seed failed');process.exitCode=1;});
