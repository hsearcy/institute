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
config.resolver.assetExts = [...config.resolver.assetExts, "glb", "gltf"];

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
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && NATIVE_TO_WEB[moduleName]) {
    return context.resolveRequest(context, NATIVE_TO_WEB[moduleName], platform);
  }
  if (typeof upstreamResolveRequest === "function") {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
