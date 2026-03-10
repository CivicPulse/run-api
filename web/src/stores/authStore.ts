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
  handleCallback: () => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => string | null
}

const userManager = new UserManager({
  authority: import.meta.env.VITE_ZITADEL_ISSUER || "https://auth.civpulse.org",
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID || "",
  redirect_uri: `${globalThis.location.origin}/callback`,
  post_logout_redirect_uri: globalThis.location.origin,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: localStorage }),
})

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  userManager,

  initialize: async () => {
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
      get().logout()
    })
  },

  login: async () => {
    await userManager.signinRedirect()
  },

  handleCallback: async () => {
    const user = await userManager.signinRedirectCallback()
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
