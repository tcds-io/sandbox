import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app calls the control API on its own origin; in dev, Vite proxies it to sandbox-api.
const api = process.env.SANDBOX_API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/_sandbox": api, "/health": api },
  },
});
