import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Разбиение vendor на чанки: дольше кэшируются React и роутер, тяжёлый xterm грузится только на экране терминала.
 */
function manualChunks(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  const n = id.split("\\").join("/");

  if (n.includes("/xterm") || n.includes("xterm-addon")) {
    return "vendor-xterm";
  }
  if (n.includes("/react-router") || n.includes("/@remix-run/")) {
    return "vendor-router";
  }
  if (n.includes("/react-dom/") || n.includes("/react/") || n.includes("/scheduler/")) {
    return "vendor-react";
  }

  return "vendor";
}

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  },
  server: {
    port: 5173
  }
});
