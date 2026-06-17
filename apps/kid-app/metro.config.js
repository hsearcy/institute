// metro.config.js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so workspace packages reload.
config.watchFolders = [monorepoRoot];

// Tell Metro where to find modules: the app's node_modules first, then the root's.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Avoid hierarchical lookup ambiguity in monorepos.
config.resolver.disableHierarchicalLookup = true;

// Allow Metro to bundle GLB / glTF model files as assets.
// `wasm` is needed for sql.js (our web SQLite backend — see persistence/db.web.ts).
config.resolver.assetExts = [...config.resolver.assetExts, "glb", "gltf", "wasm"];

// Note on transform profile: we leave the default ("hermes-stable" under
// Expo SDK 55) in place because forcing "default" globally pushed the web
// bundle past Node's heap (OOM at 99.8%). The babel plugin below handles
// the import.meta issue more surgically.

// On web builds, redirect the React-Native-only react-three packages to the
// web variants. The /native subpath uses expo-gl, which has no working web
// implementation — leaving it in produces a mounted-but-dead <canvas>.
const NATIVE_TO_WEB = {
  "@react-three/fiber/native": "@react-three/fiber",
  "@react-three/drei/native": "@react-three/drei",
};

// The root package.json pins pretty-format@30, but Metro's dev HMRClient/LogBox
// is written for v29's CommonJS export shape — on web (node-style resolution)
// the v30 pin wins and `require("pretty-format")` comes back undefined, crashing
// the app before React mounts. react-native, @expo/metro, and vitest all want
// ^29.7.0, so pin web resolution of pretty-format to the installed 29.7.0.
const PRETTY_FORMAT_29 = require.resolve("pretty-format", {
  paths: [path.resolve(monorepoRoot, "node_modules/.pnpm/pretty-format@29.7.0/node_modules")],
});

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && NATIVE_TO_WEB[moduleName]) {
    return context.resolveRequest(context, NATIVE_TO_WEB[moduleName], platform);
  }
  if (platform === "web" && moduleName === "pretty-format") {
    return { type: "sourceFile", filePath: PRETTY_FORMAT_29 };
  }
  if (typeof upstreamResolveRequest === "function") {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
