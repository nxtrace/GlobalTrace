import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/maplibre-gl") && !id.endsWith(".css")) return "vendor-maplibre";
          if (id.includes("node_modules/three")) return "vendor-three";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "vendor-react";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
  },
});
