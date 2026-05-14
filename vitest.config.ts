import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/src/**/*.test.ts", "convex/**/*.test.ts"],
  },
});
