import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"

vi.mock("@/hooks/useVoterContacts", () => ({
  useVoterContacts: vi.fn(),
  useAddPhone: vi.fn(),
  useRefreshPhoneValidation: vi.fn(),
  useUpdatePhone: vi.fn(),
  useDeletePhone: vi.fn(),
  useAddEmail: vi.fn(),
  useUpdateEmail: vi.fn(),
  useDeleteEmail: vi.fn(),
  useAddAddress: vi.fn(),
  useUpdateAddress: vi.fn(),
  useDeleteAddress: vi.fn(),
  useSetPrimaryContact: vi.fn(),
}))

vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}))

import {
  useAddAddress,
  useAddEmail,
  useAddPhone,
  useDeleteAddress,
  useDeleteEmail,
  useDeletePhone,
  useRefreshPhoneValidation,
  useSetPrimaryContact,
  useUpdateAddress,
  useUpdateEmail,
  useUpdatePhone,
  useVoterContacts,
} from "@/hooks/useVoterContacts"
import { ContactsTab } from "@/components/voters/ContactsTab"

const baseMutation = {
  mutate: vi.fn(),
  isPending: false,
}

const mockUseVoterContacts = useVoterContacts as unknown as ReturnType<typeof vi.fn>
const mockUseRefreshPhoneValidation = useRefreshPhoneValidation as unknown as ReturnType<typeof vi.fn>

describe("ContactsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVoterContacts.mockReturnValue({
      data: {
        phones: [
          {
            id: "phone-1",
            campaign_id: "campaign-1",
            voter_id: "voter-1",
            value: "+15555550123",
            type: "mobile",
            is_primary: true,
            source: "manual",
            created_at: "2026-04-08T00:00:00Z",
            updated_at: "2026-04-08T00:00:00Z",
            validation: {
              normalized_phone_number: "+15555550123",
              status: "validated",
              carrier_name: "Twilio Wireless",
              line_type: "mobile",
              sms_capable: true,
              validated_at: "2026-04-08T00:00:00Z",
              is_stale: true,
              reason_code: "phone_validation_stale",
              reason_detail:
                "Cached validation is getting old. Refresh to confirm the current line type.",
            },
          },
        ],
        emails: [],
        addresses: [],
      },
      isLoading: false,
    })
    ;[
      useAddPhone,
      useUpdatePhone,
      useDeletePhone,
      useAddEmail,
      useUpdateEmail,
      useDeleteEmail,
      useAddAddress,
      useUpdateAddress,
      useDeleteAddress,
      useSetPrimaryContact,
    ].forEach((hook) => {
      ;(hook as unknown as ReturnType<typeof vi.fn>).mockReturnValue(baseMutation)
    })
    mockUseRefreshPhoneValidation.mockReturnValue(baseMutation)
  })

  it("renders inline phone validation details", () => {
    render(<ContactsTab campaignId="campaign-1" voterId="voter-1" />)

    expect(screen.getByText("Refresh recommended")).toBeInTheDocument()
    expect(screen.getByText(/Twilio Wireless/)).toBeInTheDocument()
    expect(screen.getByText(/Refresh lookup/)).toBeInTheDocument()
  })

  it("refreshes phone validation in place", () => {
    const mutate = vi.fn()
    mockUseRefreshPhoneValidation.mockReturnValue({
      mutate,
      isPending: false,
    })

    render(<ContactsTab campaignId="campaign-1" voterId="voter-1" />)

    fireEvent.click(screen.getByRole("button", { name: /refresh lookup/i }))
    expect(mutate).toHaveBeenCalledWith("phone-1", expect.any(Object))
  })
})
