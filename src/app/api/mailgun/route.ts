import crypto from "crypto";

import { NextResponse, NextRequest } from "next/server";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const fd = formData as unknown as { get(name: string): unknown };

    // Get your HTTP webhook signing key from https://app.mailgun.com/mg/sending/mg.<yourdomain>/webhooks and add it to .env.local
    const signingKey = process.env.MAILGUN_SIGNING_KEY as string;

    const timestamp = fd.get("timestamp")?.toString() ?? "";
    const token = fd.get("token")?.toString() ?? "";
    const signature = fd.get("signature")?.toString() ?? "";

    const value = timestamp + token;
    const hash = crypto
      .createHmac("sha256", signingKey)
      .update(value)
      .digest("hex");

    if (hash !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // extract the sender, subject and email content
    const sender = fd.get("From");
    const subject = fd.get("Subject");
    const html = fd.get("body-html");

    // send email to the admin if forwardRepliesTo is et & emailData exists
    if (config.mailgun.forwardRepliesTo && html && subject && sender) {
      await sendEmail({
        to: config.mailgun.forwardRepliesTo,
        subject: `${config?.appName} | ${subject}`,
        html: `<div><p><b>- Subject:</b> ${subject}</p><p><b>- From:</b> ${sender}</p><p><b>- Content:</b></p><div>${html}</div></div>`,
        replyTo: String(sender),
      });
    }

    return NextResponse.json({});
  } catch (e: any) {
    console.error(e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
