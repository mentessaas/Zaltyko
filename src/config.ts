export const config = {
  appName: "Zaltyko",
  domainName: "https://zaltyko.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  brevo: {
    fromNoReply: `Zaltyko <noreply@zaltyko.com>`,
    fromAdmin: `Equipo Zaltyko <hola@zaltyko.com>`,
    supportEmail: "soporte@zaltyko.com",
    forwardRepliesTo: "hola@zaltyko.com",
  },
};
