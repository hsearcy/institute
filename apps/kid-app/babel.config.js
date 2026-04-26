module.exports = function (api) {
  api.cache(true);
  return {
    // Enable Expo's built-in `import.meta` transform. Some node_modules
    // (e.g. parts of three.js examples and @react-native debugger-frontend)
    // use `import.meta` syntax. Hermes supports it natively but the Metro
    // web bundle ships as a non-module script and errors at parse without
    // the transform. Expo's plugin rewrites it to globalThis.__ExpoImportMetaRegistry.
    presets: [
      ["babel-preset-expo", { unstable_transformImportMeta: true }],
    ],
  };
};
