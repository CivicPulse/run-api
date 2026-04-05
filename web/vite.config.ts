import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import { defineConfig, loadEnv } from "vite"
import {
  resolveApiTarget,
  resolveHmrConfig,
  resolveMinioTarget,
  resolveWebExternalPort,
} from "./vite.helpers"

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "")
  const env = { ...rootEnv, ...process.env }
  const isDocker = !!env.API_PROXY_TARGET
  const webExternalPort = resolveWebExternalPort(env, isDocker)
  const apiTarget = resolveApiTarget(env)
  const minioTarget = resolveMinioTarget(env)
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

  return {
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      https:
        useHttps && certPath && keyPath
          ? {
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
            }
          : undefined,
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
      hmr: resolveHmrConfig({
        isDocker,
        useHttps,
        tailscaleHost,
        webExternalPort,
      }),
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
  }
})
