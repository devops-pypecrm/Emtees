/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zodPath = fs.existsSync(path.resolve(__dirname, "./node_modules/zod"))
  ? path.resolve(__dirname, "./node_modules/zod")
  : path.resolve(__dirname, "../node_modules/zod");

const libphonePath = fs.existsSync(path.resolve(__dirname, "./node_modules/libphonenumber-js"))
  ? path.resolve(__dirname, "./node_modules/libphonenumber-js")
  : path.resolve(__dirname, "../node_modules/libphonenumber-js");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/pages": path.resolve(__dirname, "./src/pages"),
      "@contracts": path.resolve(__dirname, "../contracts"),
      "zod": zodPath,
      "libphonenumber-js": libphonePath,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
