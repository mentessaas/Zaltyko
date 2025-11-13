// app/api/webhook/route.ts
import { NextResponse } from "next/server";
import { handleWebhook } from "@/utils/lemon";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("LEMON_SQUEEZY_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "WEBHOOK_NOT_CONFIGURED" },
        { status: 500 }
      );
    }

    const signature = request.headers.get("x-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "MISSING_SIGNATURE" },
        { status: 401 }
      );
    }

    // Get raw body for signature verification
    const body = await request.text();
    let payload: unknown;
    
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return NextResponse.json(
        { error: "INVALID_JSON" },
        { status: 400 }
      );
    }

    // Verify signature using constant-time comparison
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(body).digest("hex");
    
    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );

    if (!isValid) {
      console.error("LemonSqueezy webhook signature verification failed");
      return NextResponse.json(
        { error: "INVALID_SIGNATURE" },
        { status: 401 }
      );
    }

    await handleWebhook(payload);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("LemonSqueezy webhook processing error", error);
    return NextResponse.json(
      { error: "PROCESSING_FAILED", message: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
