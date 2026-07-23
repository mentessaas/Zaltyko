import crypto from "crypto";

import { NextResponse, NextRequest } from "next/server";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { logger } from "@/lib/logger";
import { escapeHtml } from "@/lib/email/escape-html";
import { isValidEmail } from "@/lib/validation/email-utils";

const MAILGUN_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function extractReplyAddress(sender: string): string | null {
  const angleAddress = sender.match(/<([^>]+)>/)?.[1]?.trim();
  const candidate = angleAddress ?? sender.trim();
  return isValidEmail(candidate) ? candidate : null;
}

// @route-auth webhook
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const fd = formData as unknown as { get(name: string): unknown };

    // Legacy inbound webhook: Mailgun forwards replies to Brevo/support while the route is retained for compatibility.
    const signingKey = process.env.MAILGUN_SIGNING_KEY as string;
    if (!signingKey) {
      logger.error("MAILGUN_SIGNING_KEY is not configured");
      return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
    }

    const timestamp = fd.get("timestamp")?.toString() ?? "";
    const token = fd.get("token")?.toString() ?? "";
    const signature = fd.get("signature")?.toString() ?? "";

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) >
        MAILGUN_TIMESTAMP_TOLERANCE_SECONDS ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const value = timestamp + token;
    const hash = crypto
      .createHmac("sha256", signingKey)
      .update(value)
      .digest("hex");

    const expectedBuffer = Buffer.from(hash, "hex");
    const receivedBuffer = Buffer.from(signature, "hex");
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // extract the sender, subject and email content
    const sender = fd.get("From")?.toString();
    const subject = fd.get("Subject")?.toString();
    const html = fd.get("body-html")?.toString();

    // send email to the admin if forwardRepliesTo is et & emailData exists
    const replyTo = sender ? extractReplyAddress(sender) : null;
    if (config.brevo.forwardRepliesTo && html && subject && sender && replyTo) {
      await sendEmail({
        to: config.brevo.forwardRepliesTo,
        subject: `${config.appName} | ${subject}`,
        html: `<div><p><b>Asunto:</b> ${escapeHtml(subject)}</p><p><b>De:</b> ${escapeHtml(
          sender
        )}</p><p><b>Contenido:</b></p><pre>${escapeHtml(html)}</pre></div>`,
        replyTo,
      });
    }

    return NextResponse.json({});
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    logger.error(msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
