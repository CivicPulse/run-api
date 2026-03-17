import ky from "ky"

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required")
    this.name = "AuthenticationError"
  }
}

export class PermissionError extends Error {
  constructor() {
    super("Insufficient permissions")
    this.name = "PermissionError"
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || window.location.origin

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  hooks: {
    beforeRequest: [
      async (request) => {
        // Dynamic import to avoid circular dependency
        const { useAuthStore } = await import("@/stores/authStore")
        const token = useAuthStore.getState().getAccessToken()
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          const { useAuthStore } = await import("@/stores/authStore")
          // Clear local auth state only — don't call signoutRedirect() which
          // triggers a full OIDC logout redirect and destroys the session.
          // The user will see the unauthenticated landing page and can re-login.
          useAuthStore.setState({ user: null, isAuthenticated: false })
          throw new AuthenticationError()
        }
        if (response.status === 403) {
          throw new PermissionError()
        }
        return response
      },
    ],
  },
  retry: {
    limit: 3,
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    afterStatusCodes: [429, 503],
    maxRetryAfter: 60_000,
    backoffLimit: 30_000,
    delay: (attemptCount: number) =>
      Math.min(1000 * 2 ** (attemptCount - 1), 30_000),
  },
})
