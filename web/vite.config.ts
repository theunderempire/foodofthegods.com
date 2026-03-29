import { execSync } from "child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gitHash = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig(({ mode }) => ({
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [react()],
  base: mode === "development" ? "/" : "/foodofthegods/",
  envDir: "..",
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["node_modules", "e2e"],
  },
}));
