import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function uploadEventStorageObject({
  path,
  body,
  contentType,
}: {
  path: string;
  body: Buffer;
  contentType: string;
}) {
  const adminClient = getSupabaseAdminClient();

  const { error } = await adminClient.storage
    .from("events")
    .upload(path, body, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = adminClient.storage.from("events").getPublicUrl(path);

  return { publicUrl };
}

export async function getAuthUserEmail(userId: string): Promise<string | null> {
  const adminClient = getSupabaseAdminClient();
  const { data } = await adminClient.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function updateAuthUserEmail({
  userId,
  email,
  emailConfirm = false,
}: {
  userId: string;
  email: string;
  emailConfirm?: boolean;
}) {
  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: emailConfirm,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function generatePasswordRecoveryLink(email: string): Promise<string | null> {
  const adminClient = getSupabaseAdminClient();
  const { data } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  return data?.properties?.action_link ?? null;
}
