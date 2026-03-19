import { describe, test, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { FieldHeader } from "@/components/field/FieldHeader"

// Mock TanStack Router Link and useNavigate with param substitution
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: {
    to: string
    params?: Record<string, string>
    children?: React.ReactNode
    [key: string]: unknown
  }) => {
    let href = to as string
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value as string)
      }
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
  useNavigate: vi.fn(() => vi.fn()),
}))

// Mock authStore
vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}))

import { useAuthStore } from "@/stores/authStore"

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>

function mockUser(name: string, email?: string) {
  return {
    profile: {
      name,
      email: email ?? `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
    },
  }
}

describe("FieldHeader (NAV-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        user: mockUser("Sarah Johnson", "sarah@example.com"),
        logout: vi.fn().mockResolvedValue(undefined),
      }
      return selector(state)
    })
  })

  test("renders disabled help button that is always visible (NAV-04)", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    const helpButton = screen.getByRole("button", { name: /help/i })
    expect(helpButton).toBeInTheDocument()
    expect(helpButton).toBeDisabled()
  })

  test("help button has greyed-out styling when no onHelpClick provided", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    const helpButton = screen.getByRole("button", { name: /help/i })
    // The icon inside the button should have the muted/50 class for greyed-out look
    const icon = helpButton.querySelector("svg")
    expect(icon).toBeTruthy()
    expect(icon!.className).toContain("text-muted-foreground/50")
  })

  test("help button is enabled and calls onHelpClick when handler provided", () => {
    const onHelpClick = vi.fn()
    render(
      <FieldHeader
        campaignId="campaign-123"
        title="Field"
        showBack={false}
        onHelpClick={onHelpClick}
      />,
    )

    const helpButton = screen.getByRole("button", { name: /help/i })
    expect(helpButton).not.toBeDisabled()
    helpButton.click()
    expect(onHelpClick).toHaveBeenCalledOnce()
  })
})

describe("FieldHeader (NAV-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        user: mockUser("Sarah Johnson", "sarah@example.com"),
        logout: vi.fn().mockResolvedValue(undefined),
      }
      return selector(state)
    })
  })

  test("hub screen (showBack=false) does not render back arrow link", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    // No link with "Back to hub" aria-label should be present
    const backLink = screen.queryByRole("link", { name: /back to hub/i })
    expect(backLink).toBeNull()
  })

  test("sub-screen (showBack=true) renders back arrow that links to hub", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Canvassing" showBack={true} />,
    )

    // Back arrow link should be present with correct href
    const backLink = screen.getByRole("link", { name: /back to hub/i })
    expect(backLink).toBeInTheDocument()
    expect(backLink).toHaveAttribute("href", "/field/campaign-123")
  })

  test("hub screen shows spacer div instead of back button to maintain layout", () => {
    const { container } = render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    // The spacer div with w-11 class should be present
    const spacer = container.querySelector(".w-11")
    expect(spacer).toBeTruthy()
    expect(spacer?.tagName.toLowerCase()).toBe("div")
  })

  test("title is displayed in the header", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Johnson for Mayor" showBack={false} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Johnson for Mayor",
    )
  })

  test("sub-screen title changes based on prop", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Phone Banking" showBack={true} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Phone Banking",
    )
  })

  test("back arrow link has 44px touch target class (min-h-11 min-w-11)", () => {
    render(
      <FieldHeader campaignId="campaign-123" title="Canvassing" showBack={true} />,
    )

    const backLink = screen.getByRole("link", { name: /back to hub/i })
    // The Button asChild merges its className onto the Link element itself
    // So the rendered <a> tag should carry min-h-11 and min-w-11
    expect(backLink.className).toMatch(/min-h-11|min-w-11/)
  })
})

describe("FieldHeader avatar menu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("shows user initials in avatar derived from display name", () => {
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        user: mockUser("Sarah Johnson"),
        logout: vi.fn().mockResolvedValue(undefined),
      }
      return selector(state)
    })

    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    // Avatar fallback shows initials "SJ"
    expect(screen.getByText("SJ")).toBeInTheDocument()
  })

  test("shows single initial when user has one-word name", () => {
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        user: mockUser("Sarah"),
        logout: vi.fn().mockResolvedValue(undefined),
      }
      return selector(state)
    })

    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    expect(screen.getByText("S")).toBeInTheDocument()
  })

  test("avatar menu trigger has user-menu aria-label", () => {
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        user: mockUser("Sarah Johnson"),
        logout: vi.fn().mockResolvedValue(undefined),
      }
      return selector(state)
    })

    render(
      <FieldHeader campaignId="campaign-123" title="Field" showBack={false} />,
    )

    const avatarButton = screen.getByRole("button", { name: /user menu/i })
    expect(avatarButton).toBeInTheDocument()
  })
})
