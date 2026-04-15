import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("INVALID_EMAIL", "Invalid email address", 400);
    }

    if (!message || message.trim().length < 10) {
      return apiError("INVALID_MESSAGE", "Message must be at least 10 characters", 400);
    }

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
<p>${message.replace(/\n/g, "<br>")}</p>`,
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
}
