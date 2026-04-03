export interface ViteRuntimeEnv {
  API_PROXY_TARGET?: string
  MINIO_PROXY_TARGET?: string
  API_HOST_PORT?: string
  MINIO_HOST_PORT?: string
  WEB_EXTERNAL_PORT?: string
  WEB_HOST_PORT?: string
  DISABLE_TLS?: string
}

export function resolveApiTarget(env: ViteRuntimeEnv): string {
  if (env.API_PROXY_TARGET) return env.API_PROXY_TARGET

  const port = env.API_HOST_PORT || "8000"
  const scheme = env.DISABLE_TLS === "true" ? "http" : "https"
  return `${scheme}://localhost:${port}`
}

export function resolveMinioTarget(env: ViteRuntimeEnv): string {
  if (env.MINIO_PROXY_TARGET) return env.MINIO_PROXY_TARGET

  const port = env.MINIO_HOST_PORT || "9000"
  return `http://localhost:${port}`
}

export function resolveWebExternalPort(
  env: ViteRuntimeEnv,
  isDocker: boolean,
  devPort = 5173,
): number {
  if (!isDocker) return devPort

  return parseInt(
    env.WEB_EXTERNAL_PORT || env.WEB_HOST_PORT || String(devPort),
    10,
  )
}

export function resolveHmrConfig(options: {
  isDocker: boolean
  useHttps: boolean
  tailscaleHost: string | null
  webExternalPort: number
}) {
  const { isDocker, useHttps, tailscaleHost, webExternalPort } = options

  if (!isDocker) return undefined

  if (useHttps && tailscaleHost) {
    return {
      protocol: "wss" as const,
      host: tailscaleHost,
      clientPort: webExternalPort,
    }
  }

  return {
    clientPort: webExternalPort,
  }
}
