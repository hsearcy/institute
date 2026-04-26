import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    deps: {
      interopDefault: true,
    },
  },
  define: {
    __DEV__: false,
  },
});
