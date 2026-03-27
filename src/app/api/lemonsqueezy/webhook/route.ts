// app/api/webhook/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { handleWebhook } from "@/utils/lemon";
import crypto from "crypto";

// Known IP ranges for Lemon Squeezy (updated 2024)
// These are Cloudflare IPs that Lemon Squeezy uses
// Note: IP verification is optional since signature verification provides strong security
const LEMON_SQUEEZY_IPS = [
  "13.239.157.155",  // Original
  "13.251.69.161",   // Original
  // Additional IPs may be used - check Lemon Squeezy docs for current list
];

function isFromLemonSqueezy(request: Request): boolean {
  // In production, verify source IP
  // In IP development, skip check (localhost)
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = forwarded?.split(",")[0] || request.headers.get("x-real-ip");

  // If no IP header, allow (might be internal Vercel request)
  if (!realIp) {
    return true;
  }

  // For production, we rely on signature verification instead of IP allowlist
  // because Lemon Squeezy may use dynamic IPs behind Cloudflare
  // The signature verification below provides strong security
  return true;
}

export async function POST(request: Request) {
  try {
    // Verify request comes from Lemon Squeezy (optional, signature provides main security)
    if (!isFromLemonSqueezy(request)) {
      console.error("LemonSqueezy webhook request from unknown source");
      return NextResponse.json(
        { error: "INVALID_SOURCE" },
        { status: 401 }
      );
    }

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

    // Ensure both buffers have the same length before timing-safe comparison
    // timingSafeEqual throws if lengths don't match (CRITICAL BUG FIX)
    const signatureBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);

    if (signatureBuffer.length !== digestBuffer.length) {
      console.error("LemonSqueezy webhook signature length mismatch");
      return NextResponse.json(
        { error: "INVALID_SIGNATURE" },
        { status: 401 }
      );
    }

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(signatureBuffer, digestBuffer);

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
