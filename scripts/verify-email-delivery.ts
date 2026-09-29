#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Verificacion de entrega real del proveedor de correo (Brevo).
 *
 * Este script es la ultima validacion manual pendiente del cierre operativo:
 * la persistencia y la idempotencia ya estan probadas en sandbox, pero el
 * proveedor solo se valida enviando un mensaje real.
 *
 * Uso:
 *   pnpm email:verify --para tu@correo.tld
 *   EMAIL_TEST_RECIPIENT=tu@correo.tld pnpm email:verify
 *
 * Nunca guarda credenciales ni escribe el destinatario en ningun fichero.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import { getFeatureReadiness } from "@/lib/env";
// Se usa el emisor de Brevo directamente y no `sendEmailWithLogging`: este
// script valida el proveedor, no el ledger. El sender con logging consulta
// `email_logs` antes de enviar, asi que exige una base de datos configurada.
import { sendEmail } from "@/lib/brevo";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function readRecipient(): string | undefined {
  const argv = process.argv.slice(2);
  const flagIndex = argv.findIndex((arg) => arg === "--para" || arg === "--to");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1].trim();
  return process.env.EMAIL_TEST_RECIPIENT?.trim();
}

async function main(): Promise<void> {
  const readiness = getFeatureReadiness("email");
  const recipient = readRecipient();

  console.log("\nVerificacion de entrega real de correo (Brevo)\n");

  if (!readiness.ready) {
    console.log("FALTA CONFIGURACION DEL PROVEEDOR");
    console.log(`  Variables ausentes: ${readiness.missing.join(", ")}`);
    console.log("\nPara completar la validacion:");
    console.log("  1. Anade esas variables en .env.local (no en el repositorio).");
    console.log("  2. Ejecuta: pnpm email:verify --para tu@correo.tld");
    process.exit(2);
  }

  console.log("Credenciales de Brevo: configuradas");

  if (!recipient) {
    console.log("\nFALTA EL DESTINATARIO DE PRUEBA");
    console.log("  Ejecuta: pnpm email:verify --para tu@correo.tld");
    process.exit(2);
  }

  console.log(`Destinatario de prueba: ${recipient}`);
  console.log("Enviando mensaje real...");

  const result = await sendEmail({
    to: recipient,
    subject: "Zaltyko · verificacion de entrega de correo",
    replyTo: process.env.BREVO_REPLY_TO,
    html: [
      "<p>Este es un mensaje de verificacion de la entrega de correo de Zaltyko.</p>",
      "<p>Si lo has recibido, el proveedor transaccional esta operativo.</p>",
    ].join(""),
    text: "Verificacion de entrega de correo de Zaltyko. Si lo has recibido, el proveedor transaccional esta operativo.",
  });

  if (result.simulated) {
    console.log("\nENVIO SIMULADO");
    console.log("  El proveedor no estaba configurado; no se envio ningun mensaje.");
    process.exit(1);
  }

  if (result.messageId) {
    console.log("\nENTREGA ACEPTADA POR EL PROVEEDOR");
    console.log(`  Identificador del mensaje: ${result.messageId}`);
    console.log("  Revisa la bandeja del destinatario para confirmar la recepcion.");
    return;
  }

  console.log("\nEL PROVEEDOR NO ACEPTO EL ENVIO");
  console.log("  Revisa el registro de email_logs y los avisos del servidor.");
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("\nERROR AL ENVIAR LA VERIFICACION");
  console.error(`  ${message}`);
  process.exit(1);
});
