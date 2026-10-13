import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const BACKEND_URL = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser only ever talks to Vite's origin; /api is forwarded to FastAPI, so the
    // backend needs no CORS configuration at all.
    proxy: { "/api": BACKEND_URL },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: { include: ["src/**"], exclude: ["src/main.tsx"] },
  },
});
