import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts", "tests/integration/**/*.spec.ts"],
    exclude: ["tests/browser/**/*.spec.ts"],
    coverage: {
      provider: "v8"
    }
  }
});
