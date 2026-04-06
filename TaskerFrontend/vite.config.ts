import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fhenixjsMain = require.resolve("fhenixjs"); 
const fhenixjsRoot = path.resolve(fhenixjsMain, "../../.."); 

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    wasm(),
    topLevelAwait(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  optimizeDeps: {
    // exclude: ["fhenixjs"],
  },
  resolve: {
    alias: {
      "fhenixjs": path.resolve(fhenixjsRoot, "dist/fhenix.esm.js"),
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: "esnext",
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
