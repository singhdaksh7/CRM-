import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Real package is a hard `throw` unless a Next.js bundler substitutes
      // it - see src/test/stubs/server-only.ts for why this is aliased only
      // for the test runner (Next's actual build is unaffected).
      "server-only": path.resolve(__dirname, "./src/test/stubs/server-only.ts"),
    },
  },
});
