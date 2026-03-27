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

const isDocker = !!process.env.API_PROXY_TARGET
const apiTarget =
  process.env.API_PROXY_TARGET ||
  (hasTailscaleCerts ? "https://localhost:8000" : "http://localhost:8000")
const minioTarget = process.env.MINIO_PROXY_TARGET || "http://localhost:9000"
const useHttps = hasTailscaleCerts && !isDocker

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    https: useHttps
      ? {
          cert: fs.readFileSync(
            path.resolve(__dirname, "../certs/dev.tailb56d83.ts.net.crt"),
          ),
          key: fs.readFileSync(
            path.resolve(__dirname, "../certs/dev.tailb56d83.ts.net.key"),
          ),
        }
      : undefined,
    hmr: useHttps
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
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      "/openapi.json": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      "/voter-imports": {
        target: minioTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    // Use Tailscale certs for trusted HTTPS; fall back to basicSsl() for localhost (skip in Docker)
    ...(!hasTailscaleCerts && !isDocker ? [basicSsl()] : []),
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
