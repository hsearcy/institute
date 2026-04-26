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

module.exports = config;
