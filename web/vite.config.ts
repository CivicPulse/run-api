import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import { defineConfig } from "vite"

// Auto-detect Tailscale cert by scanning ../certs/ for any *.crt file.
// Supports any machine hostname (kudzu, dev, etc.) without hardcoding.
const certsDir = path.resolve(__dirname, "../certs")
const certFiles = fs.existsSync(certsDir)
  ? fs.readdirSync(certsDir).filter((f) => f.endsWith(".crt"))
  : []
const tailscaleHost = certFiles.length > 0 ? certFiles[0].replace(".crt", "") : null
const certPath = tailscaleHost ? path.join(certsDir, `${tailscaleHost}.crt`) : null
const keyPath = tailscaleHost ? path.join(certsDir, `${tailscaleHost}.key`) : null
const hasTailscaleCerts = !!(
  certPath &&
  keyPath &&
  fs.existsSync(certPath) &&
  fs.existsSync(keyPath)
)

const isDocker = !!process.env.API_PROXY_TARGET
// External port the browser uses to reach the Vite dev server (matches WEB_HOST_PORT
// in docker-compose). Needed for HMR WebSocket when behind a Docker port mapping.
const webExternalPort = parseInt(process.env.WEB_EXTERNAL_PORT || "37822", 10)
const apiTarget =
  process.env.API_PROXY_TARGET ||
  (hasTailscaleCerts ? "https://localhost:8000" : "http://localhost:8000")
const minioTarget = process.env.MINIO_PROXY_TARGET || "http://localhost:9000"
// Enable HTTPS whenever Tailscale certs are present — including Docker mode —
// so that crypto.subtle (required for PKCE) works on non-localhost hostnames.
const useHttps = hasTailscaleCerts

// Shared proxy configuration for both dev and preview servers
const proxyConfig = {
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
    // changeOrigin must be false so the Host header matches the presigned URL
    // signature. When S3_PRESIGN_ENDPOINT_URL points at the Vite proxy, the
    // presigned URL is signed for host:localhost:5173 — forwarding with that
    // Host lets MinIO validate the signature correctly.
    changeOrigin: false,
  },
} as const

// https://vite.dev/config/
export default defineConfig({
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    https: useHttps || !isDocker,
    proxy: proxyConfig,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["kudzu.tailb56d83.ts.net", "dev.tailb56d83.ts.net"],
    https:
      useHttps && certPath && keyPath
        ? {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          }
        : undefined,
    hmr: useHttps && tailscaleHost
      ? {
          protocol: "wss",
          host: tailscaleHost,
          clientPort: webExternalPort,
        }
      : {
          clientPort: webExternalPort,
        },
    proxy: proxyConfig,
  },
  plugins: [
    // Use Tailscale certs for trusted HTTPS; fall back to basicSsl() for localhost (skip in Docker)
    ...(!hasTailscaleCerts && !isDocker ? [basicSsl()] : []),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "(_components|\\.test\\.tsx$)",
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
