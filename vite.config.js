import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vorschau-Tools vergeben den Port über PORT, sonst 5180
  server: { port: Number(process.env.PORT) || 5180, strictPort: true },
});
