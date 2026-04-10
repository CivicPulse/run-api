import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const searchState = vi.hoisted(() => ({
  value: {
    code: "code-123",
    state: "state-123",
    error: "",
    error_description: "",
  } as {
    code: string
    state: string
    error: string
    error_description: string
  },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType; validateSearch?: unknown }) => {
    store.component = opts.component
    return {
      options: opts,
      useSearch: () => searchState.value,
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

import { __resetCallbackProcessedForTests } from "./callback-state"

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
    searchState.value = {
      code: "code-123",
      state: "state-123",
      error: "",
      error_description: "",
    }
    mockGetConfig.mockReturnValue({ zitadel_project_id: "project-runtime" })
    mockHandleCallback.mockResolvedValue(undefined)
    mockApiGet.mockImplementation((url: string) => {
      if (url === "api/v1/me/campaigns") {
        return {
          json: vi.fn().mockResolvedValue([{ campaign_id: "campaign-1" }]),
        }
      }
      if (url === "api/v1/campaigns/campaign-1/field/me") {
        return {
          json: vi.fn().mockResolvedValue({
            volunteer_name: "Volunteer One",
            campaign_name: "Campaign One",
            canvassing: { walk_list_id: "walk-1", name: "Walk 1", total: 10, completed: 2 },
            phone_banking: null,
          }),
        }
      }
      return {
        json: vi.fn().mockResolvedValue([]),
      }
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

  it("prefers the first campaign with an actual field assignment", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:project-runtime:roles": {
          volunteer: { "org-1": "org-1" },
        },
      },
    }
    mockApiGet.mockImplementation((url: string) => {
      if (url === "api/v1/me/campaigns") {
        return {
          json: vi.fn().mockResolvedValue([
            { campaign_id: "campaign-1" },
            { campaign_id: "campaign-2" },
          ]),
        }
      }
      if (url === "api/v1/campaigns/campaign-1/field/me") {
        return {
          json: vi.fn().mockResolvedValue({
            volunteer_name: "Volunteer One",
            campaign_name: "Campaign One",
            canvassing: null,
            phone_banking: null,
          }),
        }
      }
      if (url === "api/v1/campaigns/campaign-2/field/me") {
        return {
          json: vi.fn().mockResolvedValue({
            volunteer_name: "Volunteer One",
            campaign_name: "Campaign Two",
            canvassing: null,
            phone_banking: { session_id: "session-2", name: "Calls", total: 8, completed: 0 },
          }),
        }
      }
      return {
        json: vi.fn().mockResolvedValue([]),
      }
    })

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/field/campaign-2" })
    })
  })

  it("still routes mixed-role users to field mode when volunteer scope is present", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:project-runtime:roles": {
          admin: { "org-1": "org-1" },
          volunteer: { "org-1": "org-1" },
        },
      },
    }

    renderPage()

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

  it("renders OIDC error alert and does not call handleCallback", async () => {
    searchState.value = {
      code: "",
      state: "",
      error: "access_denied",
      error_description: "User declined",
    }

    renderPage()

    expect(await screen.findByText("User declined")).toBeInTheDocument()
    expect(mockHandleCallback).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /back to login/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: undefined },
    })
  })

  it("navigates home when callback resolves but authStore has no user", async () => {
    state.user = null
    mockHandleCallback.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(mockHandleCallback).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" })
    })
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringMatching(/^\/field\//) }),
    )
  })

  it("navigates home when volunteer has no campaigns", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:project-runtime:roles": {
          volunteer: { "org-1": "org-1" },
        },
      },
    }
    mockApiGet.mockReturnValue({
      json: vi.fn().mockResolvedValue([]),
    })

    renderPage()

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith("api/v1/me/campaigns")
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" })
    })
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringMatching(/^\/field\//) }),
    )
  })

  it("falls through to home when campaigns API fails for volunteer", async () => {
    state.user = {
      profile: {
        "urn:zitadel:iam:org:project:project-runtime:roles": {
          volunteer: { "org-1": "org-1" },
        },
      },
    }
    mockApiGet.mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error("network failure")),
    })

    renderPage()

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith("api/v1/me/campaigns")
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" })
    })
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/login" })
  })
})
