import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
    setupFiles: ["tests/setup.js"],
    testTimeout: 15000,
  },
});
