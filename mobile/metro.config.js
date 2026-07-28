// Metro config for Expo. Default settings are fine; this file exists so
// future native asset / monorepo tweaks land here without grepping.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;