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
}

// UserManager created lazily in initialize() after fetching runtime config
let _userManager: UserManager | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  initialize: async () => {
    // Guard against duplicate calls (e.g. StrictMode double-mount)
    // which would register event listeners multiple times
    if (get().isInitialized) return

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
  },

  login: async () => {
    await _userManager!.signinRedirect()
  },

  handleCallback: async (url?: string) => {
    const user = await _userManager!.signinRedirectCallback(url)
    set({ user, isAuthenticated: true })
  },

  logout: async () => {
    await _userManager!.signoutRedirect()
    set({ user: null, isAuthenticated: false })
  },

  getAccessToken: () => {
    const user = get().user
    return user?.access_token ?? null
  },
}))
