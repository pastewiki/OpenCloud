import { defineConfig } from "vitest/config";

// Integration tests talk to the real Roblox Open Cloud API. They are skipped
// unless ROBLOX_INTEGRATION=1 and the required variables are set. See
// test/integration/README.md.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // Integration tests share one rate-limit budget; run them serially.
    fileParallelism: false,
  },
});
