import { create } from "zustand"
import { UserManager, WebStorageStateStore } from "oidc-client-ts"
import type { User } from "oidc-client-ts"
import { loadConfig } from "@/config"

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isInitialized: boolean

  initialize: () => Promise<void>
  login: () => Promise<void>
  handleCallback: (url?: string) => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => string | null
  switchOrg: (zitadelOrgId: string) => Promise<void>
}

// UserManager created lazily in initialize() after fetching runtime config
let _userManager: UserManager | null = null
let _initPromise: Promise<void> | null = null

async function ensureUserManager(): Promise<UserManager> {
  if (_initPromise) await _initPromise
  if (!_userManager)
    throw new Error("Auth not initialized — call initialize() first")
  return _userManager
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return
    if (_initPromise) return _initPromise

    _initPromise = (async () => {
      const config = await loadConfig()
      _userManager = new UserManager({
        authority: config.zitadel_issuer,
        client_id: config.zitadel_client_id,
        redirect_uri: `${globalThis.location.origin}/callback`,
        post_logout_redirect_uri: globalThis.location.origin,
        response_type: "code",
        scope: `openid profile email urn:zitadel:iam:user:resourceowner urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:aud urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:roles urn:zitadel:iam:org:projects:roles`,
        automaticSilentRenew: true,
        userStore: new WebStorageStateStore({ store: localStorage }),
      })

      try {
        const user = await _userManager.getUser()
        if (user && !user.expired) {
          set({ user, isAuthenticated: true })
        }
      } catch {
        // No stored user or expired
      }
      set({ isInitialized: true })

      // Listen for token renewal
      _userManager.events.addUserLoaded((user) => {
        set({ user, isAuthenticated: true })
      })
      _userManager.events.addUserUnloaded(() => {
        set({ user: null, isAuthenticated: false })
      })
      _userManager.events.addAccessTokenExpired(() => {
        // Clear local state only — don't call signoutRedirect() which
        // destroys all OIDC state (including pending callback state)
        set({ user: null, isAuthenticated: false })
      })
    })()

    return _initPromise
  },

  login: async () => {
    const mgr = await ensureUserManager()
    await mgr.signinRedirect()
  },

  handleCallback: async (url?: string) => {
    await get().initialize()
    const mgr = await ensureUserManager()
    const user = await mgr.signinRedirectCallback(url)
    set({ user, isAuthenticated: true })
  },

  // Logout invariant: OIDC user cleared → zustand state reset → redirect.
  // Cleanup MUST run before signoutRedirect(): if the redirect throws
  // (network error, mocked in tests, popup blocked) local state is still
  // consistent. See QUAL-03/QUAL-04.
  logout: async () => {
    const mgr = await ensureUserManager()
    await mgr.removeUser()
    set({ user: null, isAuthenticated: false })
    await mgr.signoutRedirect()
  },

  getAccessToken: () => {
    const user = get().user
    return user?.access_token ?? null
  },

  switchOrg: async (zitadelOrgId: string) => {
    const mgr = await ensureUserManager()
    const config = await loadConfig()
    await mgr.signinRedirect({
      scope: [
        "openid",
        "profile",
        "email",
        `urn:zitadel:iam:org:id:${zitadelOrgId}`,
        "urn:zitadel:iam:user:resourceowner",
        `urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:aud`,
        `urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:roles`,
        "urn:zitadel:iam:org:projects:roles",
      ].join(" "),
    })
  },
}))
