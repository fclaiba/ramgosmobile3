const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require("nativewind/metro");
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Ignorar las carpetas temporales de compilación nativa en node_modules para evitar errores del file watcher
config.resolver.blockList = [
  /node_modules\/.*\/android\/\.cxx\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
  /android\/\.cxx\/.*/,
  /android\/build\/.*/
];

// Allow Metro to resolve .cjs extensions
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
];

// Fix leaflet: Metro can't resolve CJS packages whose package.json "main" lacks extension.
// Map them directly to their real .js files.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'leaflet') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/leaflet/dist/leaflet-src.js'),
      type: 'sourceFile',
    };
  }
  // react-leaflet ships ESM only — for web bundling let it resolve normally
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
