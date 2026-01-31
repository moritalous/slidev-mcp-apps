import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "build/mcp-app",
    rollupOptions: {
      input: process.env.INPUT,
    },
  },
});