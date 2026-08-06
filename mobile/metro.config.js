// Metro config for Expo. Default settings are fine; this file exists so
// future native asset / monorepo tweaks land here without grepping.
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// ZAL-389 (2026-08-06): hacer explícito el alias `@` en Metro. Con Expo SDK 57
// + babel-preset-expo el resolver ya entiende los paths de tsconfig.json
// ("@/*": ["./*"]) y por eso el build actual pasa; pero la regresión
// "Cannot find module '@/lib/auth/use-session'" en (auth)/_layout.tsx dejó
// al equipo sin saber si era tsc, Metro o caché. Fijar el alias aquí
// garantiza que Metro resuelva `@/` independientemente de cambios futuros
// en babel-preset-expo o en el resolver default.
config.resolver = config.resolver || {};
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  '@': projectRoot,
};

module.exports = config;
