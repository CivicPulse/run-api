import { create } from "zustand"
import { UserManager, WebStorageStateStore } from "oidc-client-ts"
import type { User } from "oidc-client-ts"

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isInitialized: boolean
  userManager: UserManager

  initialize: () => Promise<void>
  login: () => Promise<void>
  handleCallback: (url?: string) => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => string | null
}

const userManager = new UserManager({
  authority: import.meta.env.VITE_ZITADEL_ISSUER || "https://auth.civpulse.org",
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID || "",
  redirect_uri: `${globalThis.location.origin}/callback`,
  post_logout_redirect_uri: globalThis.location.origin,
  response_type: "code",
  scope: `openid profile email urn:zitadel:iam:user:resourceowner urn:zitadel:iam:org:project:id:${import.meta.env.VITE_ZITADEL_PROJECT_ID}:aud urn:zitadel:iam:org:project:id:${import.meta.env.VITE_ZITADEL_PROJECT_ID}:roles urn:zitadel:iam:org:projects:roles`,
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: localStorage }),
})

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  userManager,

  initialize: async () => {
    // Guard against duplicate calls (e.g. StrictMode double-mount)
    // which would register event listeners multiple times
    if (get().isInitialized) return

    try {
      const user = await userManager.getUser()
      if (user && !user.expired) {
        set({ user, isAuthenticated: true })
      }
    } catch {
      // No stored user or expired
    }
    set({ isInitialized: true })

    // Listen for token renewal
    userManager.events.addUserLoaded((user) => {
      set({ user, isAuthenticated: true })
    })
    userManager.events.addUserUnloaded(() => {
      set({ user: null, isAuthenticated: false })
    })
    userManager.events.addAccessTokenExpired(() => {
      // Clear local state only — don't call signoutRedirect() which
      // destroys all OIDC state (including pending callback state)
      set({ user: null, isAuthenticated: false })
    })
  },

  login: async () => {
    await userManager.signinRedirect()
  },

  handleCallback: async (url?: string) => {
    const user = await userManager.signinRedirectCallback(url)
    set({ user, isAuthenticated: true })
  },

  logout: async () => {
    await userManager.signoutRedirect()
    set({ user: null, isAuthenticated: false })
  },

  getAccessToken: () => {
    const user = get().user
    return user?.access_token ?? null
  },
}))
