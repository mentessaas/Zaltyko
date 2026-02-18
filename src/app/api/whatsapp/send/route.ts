/**
 * WhatsApp Notification API
 * Send notifications to parents via WhatsApp
 */

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { phone, message, academyId } = await request.json();

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone and message required" },
        { status: 400 }
      );
    }

    // Format phone for Spain
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("34")) {
      formattedPhone = "34" + formattedPhone;
    }

    // Log for now - integrate with Twilio in production
    console.log(`[WhatsApp] To: ${formattedPhone}, Message: ${message}`);

    return NextResponse.json({
      success: true,
      message: "WhatsApp queued",
      phone: formattedPhone
    });
  } catch (error) {
    console.error("WhatsApp error:", error);
    return NextResponse.json(
      { error: "Failed to send" },
      { status: 500 }
    );
  }
}
