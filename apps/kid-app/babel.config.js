module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // three.js (and some loaders) use `import.meta.url` for path resolution.
    // Metro's bundler doesn't transform this; the plugin rewrites it to a
    // module-context-safe equivalent so the web bundle doesn't error at parse.
    plugins: [["babel-plugin-transform-import-meta", { module: "ES6" }]],
  };
};
