interface AppConfig {
  zitadel_issuer: string
  zitadel_client_id: string
  zitadel_project_id: string
}

let _config: AppConfig | null = null

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config
  const res = await fetch("/api/v1/config/public")
  _config = await res.json()
  return _config!
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("Config not loaded — call loadConfig() first")
  return _config
}
