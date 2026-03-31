/**
 * Test Dashboard Flows for each user role
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://***REMOVED***.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjU5MjgsImV4cCI6MjA3ODEwMTkyOH0.1AnSfOAxpt0eUJnHk5UG0AnwyEkgsfbjU8cR76E-wv8";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyNTkyOCwiZXhwIjoyMDc4MTAxOTI4fQ.qQEEbfv4M0_T76fB7zeeREJuyEijlbTFhJgy06C_nmE";

const TEST_USERS = [
  { email: "test-superadmin@zaltyko.demo", password: "Test123!@#", role: "super_admin" },
  { email: "test-owner@zaltyko.demo", password: "Test123!@#", role: "owner" },
  { email: "test-admin@zaltyko.demo", password: "Test123!@#", role: "admin" },
  { email: "test-coach@zaltyko.demo", password: "Test123!@#", role: "coach" },
  { email: "test-athlete@zaltyko.demo", password: "Test123!@#", role: "athlete" },
  { email: "test-parent@zaltyko.demo", password: "Test123!@#", role: "parent" },
];

const PAGES_TO_TEST = {
  common: ["/dashboard", "/dashboard/academies"],
  super_admin: ["/super-admin", "/super-admin/dashboard", "/super-admin/academies", "/super-admin/users"],
  owner: ["/dashboard/athletes", "/dashboard/coaches", "/dashboard/events", "/dashboard/calendar", "/dashboard/assessments"],
  admin: ["/dashboard/athletes", "/dashboard/coaches", "/dashboard/events"],
  coach: ["/dashboard/athletes", "/dashboard/calendar"],
  athlete: ["/dashboard/profile"],
  parent: ["/dashboard/profile"],
};

async function getSessionToken(email: string, password: string) {
  const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data.session.access_token;
}

async function testPage(url: string, token: string) {
  try {
    const response = await fetch(`http://localhost:3000${url}`, {
      headers: {
        Cookie: `sb-access-token=${token}`,
      },
      redirect: 'manual'
    });
    return { status: response.status, redirect: response.headers.get("location") };
  } catch (error: any) {
    return { status: "ERROR", error: error.message };
  }
}

async function runTests() {
  console.log("🧪 Testing Dashboard Flows by Role");
  console.log("==================================\n");

  for (const user of TEST_USERS) {
    console.log(`\n👤 ${user.role.toUpperCase()} (${user.email})`);
    console.log("-".repeat(50));
    
    try {
      const token = await getSessionToken(user.email, user.password);
      const pages = [...PAGES_TO_TEST.common, ...(PAGES_TO_TEST[user.role as keyof typeof PAGES_TO_TEST] || [])];
      
      for (const page of pages) {
        const result = await testPage(page, token);
        const status = result.status === 200 ? "✅" : result.status === 307 ? "🔄" : result.status === 401 ? "🔐" : "❌";
        const redirect = result.redirect ? ` → ${result.redirect}` : "";
        console.log(`  ${status} ${page}: ${result.status}${redirect}`);
      }
    } catch (error: any) {
      console.log(`  ❌ Login failed: ${error.message}`);
    }
  }
  
  console.log("\n\n✅ Testing completed!");
}

runTests().catch(console.error);
