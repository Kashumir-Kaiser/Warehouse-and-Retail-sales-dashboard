import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { inspectAttr } from "kimi-plugin-inspect-react";

// Custom async-CSS plugin
function deferCssPlugin(): Plugin {
  return {
    name: "defer-css",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(
        /<link rel="stylesheet"(.*?)>/g,
        '<link rel="stylesheet"$1 media="print" onLoad="this.media=\'all\'">'
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [inspectAttr(), react(), deferCssPlugin()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // All React ecosystem libraries together to avoid ordering issues
            if (
              id.includes("/react/") ||           // react
              id.includes("/react-dom/") ||        // react-dom
              id.includes("/react-router/") ||      // react-router
              id.includes("/scheduler/")            // scheduler (used by React)
            ) {
              return "vendor-react-core";
            }
            // Heavy charting library
            if (id.includes("recharts")) {
              return "vendor-recharts";
            }
            // Icon library (loaded on demand by lazy pages)
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            // HTTP client
            if (id.includes("axios")) {
              return "vendor-axios";
            }
            // Remaining UI primitives (Radix, clsx, tailwind‑merge, etc.)
            return "vendor-ui";
          }
        },
      },
    },
  },
});