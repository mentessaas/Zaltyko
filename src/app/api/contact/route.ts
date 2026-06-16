import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * Sanitizes input by stripping all HTML tags to prevent XSS
 */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&[^;]*;/g, " ") // Remove HTML entities
    .trim();
}

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { name, email, subject, message, honeypot } = body;

    // Honeypot check - if filled, it's a bot
    if (honeypot) {
      // Silently succeed to not reveal the honeypot
      return apiCreated({ message: "Contact message sent successfully" });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("INVALID_EMAIL", "Invalid email address", 400);
    }

    if (!message || message.trim().length < 10) {
      return apiError("INVALID_MESSAGE", "Message must be at least 10 characters", 400);
    }

    // Strip HTML tags from message to prevent XSS
    const sanitizedMessage = stripHtml(message);

    // Send email notification
    try {
      const { sendEmail } = await import("@/lib/brevo");
      await sendEmail({
        to: "hola@zaltyko.com",
        subject: `[Zaltyko Contact] ${subject || "Sin asunto"} - ${email}`,
        text: `Nombre: ${name || "Anonymous"}\nEmail: ${email}\n\nMensaje:\n${message}`,
        html: `<p><strong>Nombre:</strong> ${name || "Anonymous"}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Asunto:</strong> ${subject || "Sin asunto"}</p>
<p><strong>Mensaje:</strong></p>
<p>${sanitizedMessage.replace(/\n/g, "<br>")}</p>`,
        replyTo: email,
      });
    } catch (emailError) {
      logger.warn("Failed to send contact email", { error: emailError });
      // Non-blocking - message is still considered sent
    }

    return apiCreated({ message: "Contact message sent successfully" });
  } catch (error) {
    logger.error("Error processing contact form:", error);
    return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
  }
}, { limit: 5, window: 60 }); // 5 requests per minute per IP
