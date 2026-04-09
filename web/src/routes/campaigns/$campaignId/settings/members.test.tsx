import React from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
}))

const mockUseMembers = vi.hoisted(() => vi.fn())
const mockUseInvites = vi.hoisted(() => vi.fn())
const mockUseCreateInvite = vi.hoisted(() => vi.fn())
const mockUseRevokeInvite = vi.hoisted(() => vi.fn())
const mockUseUpdateMemberRole = vi.hoisted(() => vi.fn())
const mockUseRemoveMember = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (opts: { component: React.ComponentType }) => {
      store.component = opts.component
      return { options: opts }
    },
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  useParams: () => ({ campaignId: "campaign-1" }),
}))

vi.mock("@/hooks/useMembers", () => ({
  useMembers: mockUseMembers,
  useUpdateMemberRole: mockUseUpdateMemberRole,
  useRemoveMember: mockUseRemoveMember,
}))

vi.mock("@/hooks/useInvites", () => ({
  useInvites: mockUseInvites,
  useCreateInvite: mockUseCreateInvite,
  useRevokeInvite: mockUseRevokeInvite,
}))

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasRole: () => true,
  }),
}))

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { profile: { sub: string } } }) => unknown) =>
    selector({ user: { profile: { sub: "user-1" } } }),
}))

vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/TooltipIcon", () => ({
  TooltipIcon: () => null,
}))

vi.mock("@/components/shared/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open?: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

import "./members"

function renderPage() {
  const Component = store.component
  if (!Component) throw new Error("Members settings component was not captured")
  return render(<Component />)
}

describe("Members settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseMembers.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseInvites.mockReturnValue({
      data: [
        {
          id: "invite-1",
          campaign_id: "campaign-1",
          email: "viewer2@example.com",
          role: "volunteer",
          created_at: "2026-04-08T15:00:00Z",
          expires_at: "2026-04-15T15:00:00Z",
          email_delivery_status: "failed",
          email_delivery_error: "Mailbox unavailable",
          email_delivery_last_event_at: "2026-04-08T15:10:00Z",
        },
      ],
      isLoading: false,
    })
    mockUseCreateInvite.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    mockUseRevokeInvite.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    mockUseUpdateMemberRole.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    mockUseRemoveMember.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
  })

  it("renders pending invites from the bare invite array and shows delivery support details", () => {
    renderPage()

    expect(screen.getByRole("heading", { name: "Pending Invites" })).toBeInTheDocument()
    expect(screen.getByText("viewer2@example.com")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Mailbox unavailable")).toBeInTheDocument()
    expect(screen.getByText(/last event/i)).toBeInTheDocument()
  })
})
