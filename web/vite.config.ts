import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { publicEsmPlugin } from "./vitePublicEsm";

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [publicEsmPlugin(), react()],
  server: { headers },
  preview: { headers },
  worker: { format: "es" },
});
