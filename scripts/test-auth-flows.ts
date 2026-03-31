/**
 * Test Script: User Auth Flows
 * Tests all user roles and their dashboard flows
 * 
 * Run: pnpm tsx scripts/test-auth-flows.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://***REMOVED***.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyNTkyOCwiZXhwIjoyMDc4MTAxOTI4fQ.qQEEbfv4M0_T76fB7zeeREJuyEijlbTFhJgy06C_nmE";

// Service client for admin operations
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface TestUser {
  email: string;
  password: string;
  role: string;
  name: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: "test-superadmin@zaltyko.demo",
    password: "Test123!@#",
    role: "super_admin",
    name: "Test Super Admin"
  },
  {
    email: "test-owner@zaltyko.demo",
    password: "Test123!@#",
    role: "owner",
    name: "Test Owner"
  },
  {
    email: "test-admin@zaltyko.demo",
    password: "Test123!@#",
    role: "admin",
    name: "Test Admin"
  },
  {
    email: "test-coach@zaltyko.demo",
    password: "Test123!@#",
    role: "coach",
    name: "Test Coach"
  },
  {
    email: "test-athlete@zaltyko.demo",
    password: "Test123!@#",
    role: "athlete",
    name: "Test Athlete"
  },
  {
    email: "test-parent@zaltyko.demo",
    password: "Test123!@#",
    role: "parent",
    name: "Test Parent"
  }
];

async function createTestUser(user: TestUser) {
  console.log(`\n📝 Creating user: ${user.email} (${user.role})`);
  
  try {
    // Check if user exists
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existing?.users.find(u => u.email === user.email);
    
    let userId: string;
    
    if (existingUser) {
      console.log(`  ✓ User already exists: ${existingUser.id}`);
      userId = existingUser.id;
    } else {
      // Create new user
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          role: user.role
        }
      });
      
      if (error) {
        console.log(`  ✗ Error creating user: ${error.message}`);
        return null;
      }
      
      userId = data.user.id;
      console.log(`  ✓ User created: ${userId}`);
    }
    
    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      user_id: userId,
      name: user.name,
      role: user.role,
      can_login: true,
      tenant_id: "00000000-0000-0000-0000-000000000001",
    }, {
      onConflict: "user_id"
    });
    
    if (profileError) {
      console.log(`  ⚠ Profile error (may already exist): ${profileError.message}`);
    } else {
      console.log(`  ✓ Profile created/updated`);
    }
    
    return userId;
  } catch (error: any) {
    console.log(`  ✗ Error: ${error.message}`);
    return null;
  }
}

async function testUserLogin(user: TestUser) {
  console.log(`\n🔐 Testing login: ${user.email}`);
  
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: user.email,
    password: user.password
  });
  
  if (error) {
    console.log(`  ✗ Login failed: ${error.message}`);
    return null;
  }
  
  console.log(`  ✓ Login successful!`);
  console.log(`  Session expires: ${new Date(data.session.expires_at! * 1000).toISOString()}`);
  
  return data.session;
}

async function runTests() {
  console.log("🚀 Zaltyko Auth Flow Tests");
  console.log("==========================\n");
  
  // Create all test users
  console.log("📋 Creating test users...");
  for (const user of TEST_USERS) {
    await createTestUser(user);
  }
  
  // Test login flows
  console.log("\n\n🔐 Testing login flows...");
  for (const user of TEST_USERS) {
    await testUserLogin(user);
  }
  
  console.log("\n\n✅ Tests completed!");
  console.log("\nTest credentials:");
  for (const user of TEST_USERS) {
    console.log(`  ${user.role}: ${user.email} / ${user.password}`);
  }
}

runTests().catch(console.error);
