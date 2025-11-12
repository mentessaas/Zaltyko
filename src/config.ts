export const config = {
  appName: "Zaltyko",
  domainName: "https://gymna.app",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  mailgun: {
    subdomain: "mg",
    fromNoReply: `Zaltyko <noreply@gymna.app>`,
    fromAdmin: `Equipo Zaltyko <hola@gymna.app>`,
    supportEmail: "soporte@gymna.app",
    forwardRepliesTo: "hola@gymna.app",
  },
};
