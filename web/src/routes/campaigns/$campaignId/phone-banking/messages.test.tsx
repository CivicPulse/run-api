import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"
import type {
  SmsBulkSendResponse,
  SmsConversation,
  SmsConversationDetail,
} from "@/types/sms"

const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))
const _routeState = vi.hoisted(() => ({ campaignId: "campaign-1" }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  useParams: vi.fn(() => _routeState),
}))

vi.mock("@/hooks/useSmsInbox", () => ({
  useSmsInbox: vi.fn(),
}))

vi.mock("@/hooks/useSmsSend", () => ({
  useSmsSend: vi.fn(),
}))

import { useSmsInbox } from "@/hooks/useSmsInbox"
import { useSmsSend } from "@/hooks/useSmsSend"
import "./messages"

const mockUseSmsInbox = useSmsInbox as unknown as ReturnType<typeof vi.fn>
const mockUseSmsSend = useSmsSend as unknown as ReturnType<typeof vi.fn>

function makeConversation(
  overrides: Partial<SmsConversation> = {},
): SmsConversation {
  return {
    id: "conversation-1",
    voter_id: "voter-1",
    voter_phone_id: "phone-1",
    org_phone_number_id: "org-phone-1",
    normalized_to_number: "+15555550123",
    last_message_preview: "Can you volunteer this weekend?",
    last_message_direction: "outbound",
    last_message_status: "delivered",
    last_message_at: "2026-04-07T22:00:00Z",
    unread_count: 2,
    opt_out_status: "active",
    opted_out_at: null,
    ...overrides,
  }
}

function makeDetail(
  overrides: Partial<SmsConversationDetail> = {},
): SmsConversationDetail {
  const conversation = makeConversation()
  return {
    conversation,
    messages: [
      {
        id: "message-1",
        conversation_id: conversation.id,
        direction: "outbound",
        body: "Can you volunteer this weekend?",
        message_type: "text",
        provider_status: "delivered",
        from_number: "+15550000001",
        to_number: conversation.normalized_to_number,
        created_at: "2026-04-07T22:00:00Z",
      },
      {
        id: "message-2",
        conversation_id: conversation.id,
        direction: "inbound",
        body: "Yes, I can help.",
        message_type: "text",
        provider_status: "received",
        from_number: conversation.normalized_to_number,
        to_number: "+15550000001",
        created_at: "2026-04-07T22:05:00Z",
      },
    ],
    eligibility: {
      allowed: true,
      opt_out_status: "active",
      voter_phone_id: "phone-1",
      normalized_phone_number: conversation.normalized_to_number,
      validation: {
        normalized_phone_number: conversation.normalized_to_number,
        status: "validated",
        carrier_name: "Twilio Wireless",
        line_type: "mobile",
        sms_capable: true,
        validated_at: "2026-04-07T22:00:00Z",
        is_stale: false,
      },
      reason_code: null,
      reason_detail: null,
    },
    ...overrides,
  }
}

function makeInboxState(overrides: Partial<ReturnType<typeof useSmsInbox>> = {}) {
  return {
    conversations: [makeConversation()],
    isListLoading: false,
    selectedConversation: makeDetail(),
    isDetailLoading: false,
    markRead: {
      mutate: vi.fn(),
      isPending: false,
    },
    ...overrides,
  }
}

function makeSendState(overrides: Record<string, unknown> = {}) {
  return {
    sendMessage: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    },
    bulkSend: {
      mutateAsync: vi.fn().mockResolvedValue({
        job_id: "job-1",
        queued_count: 3,
        blocked_count: 1,
      } satisfies SmsBulkSendResponse),
      isPending: false,
    },
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) {
    throw new Error("MessagesPage component not captured by createFileRoute mock")
  }
  return render(<Component />)
}

describe("MessagesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSmsInbox.mockReturnValue(makeInboxState())
    mockUseSmsSend.mockReturnValue(makeSendState())
  })

  it("renders the conversation list and selected thread detail", async () => {
    renderPage()

    expect(screen.getAllByText("+15555550123")).toHaveLength(2)
    expect(
      screen.getAllByText("Can you volunteer this weekend?").length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("Yes, I can help.")).toBeInTheDocument()
    expect(screen.getByTestId("sms-eligibility-summary")).toHaveTextContent(
      "This number can be used for SMS outreach."
    )

    await waitFor(() => {
      expect(
        mockUseSmsInbox.mock.results[0]?.value.markRead.mutate,
      ).toHaveBeenCalledWith("conversation-1")
    })

    expect(screen.getByTestId("messages-layout").className).toContain("flex-col")
  })

  it("shows an opt-out banner and disables the composer when SMS is opted out", () => {
    mockUseSmsInbox.mockReturnValue(
      makeInboxState({
        selectedConversation: makeDetail({
          eligibility: {
            allowed: false,
            opt_out_status: "opted_out",
            voter_phone_id: "phone-1",
            normalized_phone_number: "+15555550123",
            reason_code: "opted_out",
            reason_detail: "This contact has opted out of SMS outreach.",
          },
        }),
      }),
    )

    renderPage()

    expect(screen.getByText("SMS Opt-Out Active")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /send sms/i }),
    ).toBeDisabled()
  })

  it("shows a consent warning banner when SMS eligibility is unclear", () => {
    mockUseSmsInbox.mockReturnValue(
      makeInboxState({
        selectedConversation: makeDetail({
          eligibility: {
            allowed: false,
            opt_out_status: "active",
            voter_phone_id: "phone-1",
            normalized_phone_number: "+15555550123",
            validation: {
              normalized_phone_number: "+15555550123",
              status: "review_needed",
              carrier_name: null,
              line_type: "voip",
              sms_capable: false,
              validated_at: "2026-04-07T22:00:00Z",
              is_stale: false,
            },
            reason_code: "missing_sms_consent",
            reason_detail:
              "Imported phone numbers alone do not make a voter textable.",
          },
        }),
      }),
    )

    renderPage()

    expect(screen.getByText("SMS Send Blocked")).toBeInTheDocument()
    expect(
      screen.getByText("Imported phone numbers alone do not make a voter textable."),
    ).toBeInTheDocument()
  })

  it("shows stale validation helper copy distinct from hard blocks", () => {
    mockUseSmsInbox.mockReturnValue(
      makeInboxState({
        selectedConversation: makeDetail({
          eligibility: {
            allowed: false,
            opt_out_status: "active",
            voter_phone_id: "phone-1",
            normalized_phone_number: "+15555550123",
            validation: {
              normalized_phone_number: "+15555550123",
              status: "validated",
              carrier_name: "Twilio Wireless",
              line_type: "mobile",
              sms_capable: true,
              validated_at: "2025-12-01T00:00:00Z",
              is_stale: true,
            },
            reason_code: "phone_validation_stale",
            reason_detail:
              "Cached validation is getting old. Refresh to confirm the current line type.",
          },
        }),
      }),
    )

    renderPage()

    expect(screen.getByText("Validation Refresh Recommended")).toBeInTheDocument()
    expect(screen.getByTestId("sms-eligibility-summary")).toHaveTextContent(
      "Cached validation is getting old. Refresh to confirm the current line type."
    )
  })

  it("opens the bulk-send sheet and shows queued status after submission", async () => {
    const bulkSendMutateAsync = vi.fn().mockResolvedValue({
      job_id: "job-22",
      queued_count: 3,
      blocked_count: 1,
    } satisfies SmsBulkSendResponse)
    mockUseSmsSend.mockReturnValue(
      makeSendState({
        bulkSend: {
          mutateAsync: bulkSendMutateAsync,
          isPending: false,
        } as unknown,
      }),
    )

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: /send bulk sms/i }))
    expect(screen.getByText("Recipient count")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Message body"), {
      target: { value: "Weekend reminder" },
    })
    fireEvent.click(screen.getByRole("button", { name: /queue sms/i }))

    await waitFor(() => {
      expect(bulkSendMutateAsync).toHaveBeenCalledWith({
        voter_phone_ids: ["phone-1"],
        body: "Weekend reminder",
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId("bulk-send-status-card")).toBeInTheDocument()
    })
    expect(screen.getByText(/Queued: 3/)).toBeInTheDocument()
    expect(screen.getByText(/Blocked: 1/)).toBeInTheDocument()
  })
})
