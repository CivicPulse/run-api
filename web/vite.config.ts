import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import { defineConfig } from "vite"

const hasTailscaleCerts = fs.existsSync(
  path.resolve(__dirname, "../certs/dev.tailb56d83.ts.net.crt"),
)

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    https: hasTailscaleCerts
      ? {
          cert: fs.readFileSync(
            path.resolve(__dirname, "../certs/dev.tailb56d83.ts.net.crt"),
          ),
          key: fs.readFileSync(
            path.resolve(__dirname, "../certs/dev.tailb56d83.ts.net.key"),
          ),
        }
      : undefined,
    hmr: hasTailscaleCerts
      ? {
          protocol: "wss",
          host: "dev.tailb56d83.ts.net",
          clientPort: 5173,
        }
      : {
          clientPort: 5173,
        },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/openapi.json": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/voter-imports": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    // Use Tailscale certs for trusted HTTPS; fall back to basicSsl() for localhost
    ...(hasTailscaleCerts ? [] : [basicSsl()]),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "_components",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
