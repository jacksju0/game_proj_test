import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: https://<user>.github.io/game_proj_test/
export default defineConfig({
  base: "/game_proj_test/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});
