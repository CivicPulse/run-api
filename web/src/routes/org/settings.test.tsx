import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
}))

const useOrgState = vi.hoisted(() => ({
  data: {
    id: "org-1",
    name: "Test Org",
    zitadel_org_id: "zit-org-1",
    created_at: "2026-04-07T00:00:00Z",
    twilio: {
      account_sid: "AC123",
      account_sid_configured: true,
      account_sid_updated_at: "2026-04-07T00:00:00Z",
      auth_token_configured: true,
      auth_token_hint: "••••6789",
      auth_token_updated_at: "2026-04-07T00:00:00Z",
      ready: true,
      budget: {
        configured: true,
        soft_budget_cents: 5000,
        warning_percent: 80,
        state: "near_limit",
        finalized_spend_cents: 3200,
        pending_spend_cents: 500,
        pending_item_count: 1,
        estimated_total_spend_cents: 3700,
        remaining_budget_cents: 1300,
        warning_threshold_cents: 4000,
        updated_at: "2026-04-07T00:00:00Z",
      },
      recent_activity: [
        {
          id: "ledger-1",
          channel: "sms",
          event_type: "sms.message",
          provider_sid: "SM123",
          provider_status: "delivered",
          cost_cents: 120,
          pending_cost: false,
          campaign_id: "campaign-1",
          voter_id: "voter-1",
          created_at: "2026-04-07T00:00:00Z",
        },
      ],
    },
  },
  isLoading: false,
}))

const mutateAsync = vi.hoisted(() => vi.fn())
const hasOrgRole = vi.hoisted(() => vi.fn((role: string) => role === "org_owner"))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (opts: { component: React.ComponentType }) => {
      store.component = opts.component
      return { options: opts }
    },
}))

vi.mock("@/hooks/useOrg", () => ({
  useOrg: () => useOrgState,
  useUpdateOrg: () => ({
    mutateAsync,
    isPending: false,
  }),
}))

vi.mock("@/hooks/useOrgPermissions", () => ({
  useOrgPermissions: () => ({
    hasOrgRole,
  }),
}))

vi.mock("@/components/org/PhoneNumbersCard", () => ({
  PhoneNumbersCard: () => <div data-testid="phone-numbers-card" />,
}))

vi.mock("@/components/org/DangerZone", () => ({
  DangerZone: () => <div data-testid="danger-zone" />,
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

import "./settings"

describe("Org settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderPage() {
    const Component = store.component
    if (!Component) throw new Error("Org settings component was not captured")
    return render(<Component />)
  }

  it("shows redacted twilio status without rendering a stored secret", () => {
    renderPage()

    expect(screen.getByText(/twilio communications/i)).toBeInTheDocument()
    expect(screen.getByText(/auth token: ••••6789/i)).toBeInTheDocument()
    expect(
      screen.getByText(/stored secrets are never returned to the browser/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/twilio auth token/i)).toHaveValue("")
  })

  it("submits only changed twilio fields for owners", async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/twilio auth token/i), {
      target: { value: "new-secret-token" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    expect(mutateAsync).toHaveBeenCalledWith({
      twilio: { auth_token: "new-secret-token" },
    })
  })

  it("renders read-only inputs for org admins", () => {
    hasOrgRole.mockImplementation((role: string) => role === "org_admin")
    renderPage()

    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/twilio account sid/i)).toHaveAttribute("readonly")
    expect(screen.getByLabelText(/twilio auth token/i)).toHaveAttribute("readonly")
  })
})
