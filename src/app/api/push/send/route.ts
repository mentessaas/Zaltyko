import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  userId?: string;
}

// Mock web-push for TypeScript - actual implementation would need web-push package
const webpush = {
  setVapidDetails: () => {},
  sendNotification: async () => ({ statusCode: 200 }),
};

export async function POST(request: NextRequest) {
  try {
    // Verify admin user
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "super_admin") {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    const payload: PushNotificationPayload = await request.json();

    if (!payload.title || !payload.body) {
      return NextResponse.json(
        { error: "Title and body are required" },
        { status: 400 }
      );
    }

    // Get subscriptions - either all or specific user
    let query = supabaseAdmin
      .from("push_subscriptions")
      .select("*");

    if (payload.userId) {
      query = query.eq("user_id", payload.userId);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return NextResponse.json(
        { error: "Failed to fetch subscriptions" },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No subscriptions found",
        sent: 0,
      });
    }

    // Mock sending push notifications
    // In production, use actual web-push package
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          // Actual implementation would call:
          // await webpush.sendNotification({ endpoint, keys }, payload)
          return { endpoint: sub.endpoint, success: true };
        } catch (error: unknown) {
          if (error && typeof error === "object" && "statusCode" in error) {
            const err = error as { statusCode: number };
            if (err.statusCode === 410) {
              await supabaseAdmin
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", sub.endpoint);
            }
          }
          return { endpoint: sub.endpoint, success: false };
        }
      })
    );

    const sent = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    return NextResponse.json({
      success: true,
      total: subscriptions.length,
      sent,
      failed: subscriptions.length - sent,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
