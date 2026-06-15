const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Ignorar las carpetas temporales de compilación nativa en node_modules para evitar errores del file watcher
config.resolver.blockList = [
  /node_modules\/.*\/android\/\.cxx\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
  /android\/\.cxx\/.*/,
  /android\/build\/.*/
];

module.exports = withNativeWind(config, { input: "./global.css" });
