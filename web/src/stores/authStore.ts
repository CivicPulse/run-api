import { create } from "zustand"
import ky, { HTTPError } from "ky"

/**
 * Native cookie-session auth store (Step 5).
 *
 * The session lives in an httpOnly `cp_session` cookie that JS cannot
 * read. All state reflects what the backend reports via `/auth/me`.
 *
 * Dev note: this store uses a local `ky` instance (not `@/api/client`) to
 * avoid a circular dependency — `@/api/client` imports this store to pull
 * the CSRF cookie on mutating requests.
 */

export type AuthStatus = "unknown" | "authenticated" | "unauthenticated"

export interface AuthRole {
  name: string
  permissions: string[]
}

export interface MeResponse {
  id: string
  email: string
  display_name: string
  org_id: string | null
  org_ids: string[]
  role: AuthRole | null
  is_active: boolean
  is_verified: boolean
}

export interface LoginFailure {
  kind: "bad_credentials" | "not_verified" | "network" | "unknown"
  message: string
}

interface AuthState {
  user: MeResponse | null
  status: AuthStatus

  fetchMe: () => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<LoginFailure | null>
  logout: () => Promise<void>
  initialize: () => Promise<void>
}

const API_BASE = window.location.origin

// Local ky instance with credentials:include. GETs are safe and login/
// register are on the CSRF exempt list. Logout is NOT exempt — we attach
// the X-CSRF-Token header ourselves in `logout()` below.
const authApi = ky.create({
  prefixUrl: API_BASE,
  credentials: "include",
  retry: 0,
})

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "unknown",

  fetchMe: async () => {
    try {
      const me = await authApi.get("api/v1/auth/me").json<MeResponse>()
      set({ user: me, status: "authenticated" })
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 401) {
        set({ user: null, status: "unauthenticated" })
        return
      }
      // Network / server error — treat as unauthenticated so the router
      // will send the user to /login rather than spin forever.
      set({ user: null, status: "unauthenticated" })
    }
  },

  loginWithPassword: async (email, password) => {
    const form = new URLSearchParams()
    form.set("username", email)
    form.set("password", password)
    try {
      await authApi.post("api/v1/auth/login", {
        body: form,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    } catch (err) {
      if (err instanceof HTTPError) {
        const status = err.response.status
        let detail: unknown = null
        try {
          detail = await err.response.clone().json()
        } catch {
          // ignore
        }
        const rawDetail =
          detail && typeof detail === "object" && "detail" in detail
            ? (detail as { detail: unknown }).detail
            : undefined
        const detailCode =
          typeof rawDetail === "string"
            ? rawDetail
            : typeof rawDetail === "object" && rawDetail && "code" in rawDetail
              ? (rawDetail as { code?: string }).code
              : undefined

        if (status === 400 && detailCode === "LOGIN_USER_NOT_VERIFIED") {
          return {
            kind: "not_verified",
            message: "Please verify your email before logging in.",
          }
        }
        if (status === 400 && detailCode === "LOGIN_BAD_CREDENTIALS") {
          return {
            kind: "bad_credentials",
            message: "Invalid email or password.",
          }
        }
        if (status === 400 || status === 401) {
          return {
            kind: "bad_credentials",
            message: "Invalid email or password.",
          }
        }
        return {
          kind: "unknown",
          message: `Login failed (${status}).`,
        }
      }
      return {
        kind: "network",
        message: "Unable to reach the server. Check your connection.",
      }
    }
    await get().fetchMe()
    return null
  },

  logout: async () => {
    try {
      let csrf = getCsrfCookie()
      if (!csrf) {
        await bootstrapCsrf()
        csrf = getCsrfCookie()
      }
      await authApi.post("api/v1/auth/logout", {
        headers: csrf ? { "X-CSRF-Token": csrf } : {},
      })
    } catch {
      // Even if logout fails server-side, clear local state.
    }
    set({ user: null, status: "unauthenticated" })
  },

  initialize: async () => {
    if (get().status !== "unknown") return
    await get().fetchMe()
  },
}))

/** Read the non-httpOnly `cp_csrf` cookie (if any). */
export function getCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)cp_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/** Best-effort bootstrap of the CSRF token (sets the `cp_csrf` cookie). */
export async function bootstrapCsrf(): Promise<string | null> {
  try {
    const res = await authApi
      .get("api/v1/auth/csrf")
      .json<{ csrf_token: string }>()
    return res.csrf_token
  } catch {
    return null
  }
}
