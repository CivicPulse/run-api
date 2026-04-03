import React from "react"
import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
}))

const mockNavigate = vi.hoisted(() => vi.fn())
const mockHandleCallback = vi.hoisted(() => vi.fn())
const mockApiGet = vi.hoisted(() => vi.fn())
const mockGetConfig = vi.hoisted(() => vi.fn())

const state = vi.hoisted(() => ({
  user: null as null | { profile: Record<string, unknown> },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType; validateSearch?: unknown }) => {
    store.component = opts.component
    return {
      options: opts,
      useSearch: () => ({ code: "code-123", state: "state-123" }),
    }
  },
  useNavigate: () => mockNavigate,
}))

vi.mock("@/stores/authStore", () => {
  const useAuthStore = ((selector: (value: { handleCallback: typeof mockHandleCallback }) => unknown) =>
    selector({ handleCallback: mockHandleCallback })) as unknown as {
      getState: () => typeof state
    }
  useAuthStore.getState = () => state

  return {
    useAuthStore,
  }
})

vi.mock("@/api/client", () => ({
  api: {
    get: mockApiGet,
  },
}))

vi.mock("@/config", () => ({
  getConfig: mockGetConfig,
}))

import { __resetCallbackProcessedForTests } from "./callback"

function renderPage() {
  const Component = store.component
  if (!Component) throw new Error("Callback component was not captured")
  return render(<Component />)
}

describe("Callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCallbackProcessedForTests()
    state.user = null
    mockGetConfig.mockReturnValue({ zitadel_project_id: "project-runtime" })
    mockHandleCallback.mockResolvedValue(undefined)
    mockApiGet.mockReturnValue({
      json: vi.fn().mockResolvedValue([{ campaign_id: "campaign-1" }]),
    })
  })

  it("uses runtime config claims to send volunteer users into field mode", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:project-runtime:roles": {
          volunteer: { "org-1": "org-1" },
        },
      },
    }

    renderPage()

    await waitFor(() => {
      expect(mockHandleCallback).toHaveBeenCalledWith(
        expect.stringContaining("/callback?code=code-123&state=state-123"),
      )
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/field/campaign-1" })
    })
  })

  it("falls back to home when no matching role claim exists for runtime project config", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:stale-build-id:roles": {
          volunteer: { "org-1": "org-1" },
        },
      },
    }

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" })
    })
  })
})
