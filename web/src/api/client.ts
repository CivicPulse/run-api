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

// Use window.location.origin by default -- API is same-origin in production
// (Docker serves SPA), dev (vite proxy), and E2E (vite preview proxy).
// VITE_API_BASE_URL overrides only when explicitly set to a non-empty value.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || window.location.origin

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)cp_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  credentials: "include",
  hooks: {
    beforeRequest: [
      async (request) => {
        const method = request.method.toUpperCase()
        if (MUTATING_METHODS.has(method)) {
          let token = readCsrfCookie()
          if (!token) {
            // Bootstrap a CSRF cookie lazily so the first mutating call
            // after page load doesn't 403.
            const { bootstrapCsrf } = await import("@/stores/authStore")
            token = await bootstrapCsrf()
          }
          if (token) {
            request.headers.set("X-CSRF-Token", token)
          }
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          const { useAuthStore } = await import("@/stores/authStore")
          useAuthStore.setState({ user: null, status: "unauthenticated" })
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
