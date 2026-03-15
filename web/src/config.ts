interface AppConfig {
  zitadel_issuer: string
  zitadel_client_id: string
  zitadel_project_id: string
}

let _config: AppConfig | null = null
let _configPromise: Promise<AppConfig> | null = null

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config
  if (_configPromise) return _configPromise
  _configPromise = (async () => {
    const res = await fetch("/api/v1/config/public")
    if (!res.ok) {
      _configPromise = null
      throw new Error(`Failed to load config: ${res.status} ${res.statusText}`)
    }
    _config = await res.json()
    return _config!
  })()
  return _configPromise
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("Config not loaded — call loadConfig() first")
  return _config
}
