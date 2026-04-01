import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"

const _store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
}))

const mockNavigate = vi.hoisted(() => vi.fn())
const mockInvalidateQueries = vi.hoisted(() => vi.fn())
const mockCreateCampaignMutateAsync = vi.hoisted(() => vi.fn())
const mockAddMemberToCampaignMutateAsync = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockCurrentOrg = vi.hoisted(() => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Org",
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  useBlocker: vi.fn(),
  useNavigate: () => mockNavigate,
}))

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((options?: { mutationFn?: unknown }) => ({
    mutateAsync:
      options?.mutationFn === mockAddMemberToCampaignMutateAsync
        ? mockAddMemberToCampaignMutateAsync
        : mockCreateCampaignMutateAsync,
    isPending: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}))

vi.mock("@/components/shared/TooltipIcon", () => ({
  TooltipIcon: () => null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}))

vi.mock("@/components/ui/select", async () => {
  const ReactModule = await import("react")

  type SelectContextValue = {
    value: string
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
  }

  const SelectContext = ReactModule.createContext<SelectContextValue>({
    value: "",
    onValueChange: () => {},
    options: [],
  })

  function extractOptions(children: React.ReactNode): Array<{ value: string; label: string }> {
    return ReactModule.Children.toArray(children).flatMap((child) => {
      if (!ReactModule.isValidElement(child)) return []
      const props = child.props as {
        children?: React.ReactNode
        value?: string
      }
      if (typeof props.value === "string") {
        return [
          {
            value: props.value,
            label:
              typeof props.children === "string"
                ? props.children
                : String(props.children ?? props.value),
          },
        ]
      }
      return extractOptions(props.children)
    })
  }

  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: React.ReactNode
      value?: string
      onValueChange?: (value: string) => void
    }) => (
      <SelectContext.Provider
        value={{
          value: value ?? "",
          onValueChange: onValueChange ?? (() => {}),
          options: extractOptions(children),
        }}
      >
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => {
      const ctx = ReactModule.useContext(SelectContext)
      return (
        <select
          aria-label="Campaign Type *"
          value={ctx.value}
          onChange={(e) => ctx.onValueChange(e.target.value)}
          {...props}
        >
          <option value="">Select a type</option>
          {ctx.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

vi.mock("@/hooks/useOrg", () => ({
  useOrgMembers: () => ({ data: [] }),
  useAddMemberToCampaign: () => ({
    mutateAsync: mockAddMemberToCampaignMutateAsync,
    isPending: false,
  }),
}))

vi.mock("@/hooks/useOrgPermissions", () => ({
  useOrgPermissions: () => ({
    currentOrg: mockCurrentOrg,
  }),
}))

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { profile: { sub: string } } }) => unknown) =>
    selector({ user: { profile: { sub: "user-1" } } }),
}))

import "./new"

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("NewCampaignPage component was not captured")
  return render(<Component />)
}

describe("New Campaign Page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvalidateQueries.mockResolvedValue(undefined)
    mockCreateCampaignMutateAsync.mockResolvedValue({
      id: "campaign-123",
      name: "Test Campaign",
    })
    mockAddMemberToCampaignMutateAsync.mockResolvedValue({})
    mockNavigate.mockResolvedValue(undefined)
  })

  it("falls back to a hard redirect when client navigation fails after a successful create", async () => {
    const assignSpy = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => undefined)

    mockNavigate.mockRejectedValueOnce(new Error("router navigation failed"))

    renderPage()

    fireEvent.change(screen.getByLabelText("Campaign Name *"), {
      target: { value: "Regression Test Campaign" },
    })
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "local" },
    })

    fireEvent.click(screen.getByRole("button", { name: /continue to review/i }))
    await screen.findByText("Review your campaign")

    fireEvent.click(screen.getByRole("button", { name: /continue to invite/i }))
    await screen.findByText("Add team members")

    fireEvent.click(screen.getByRole("button", { name: /^Create Campaign$/i }))

    await waitFor(() => {
      expect(mockCreateCampaignMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Regression Test Campaign",
          type: "local",
          organization_id: mockCurrentOrg.id,
        }),
      )
    })

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        "/campaigns/campaign-123/dashboard",
      )
    })

    expect(
      screen.queryByText("Failed to create campaign. Check your connection and try again."),
    ).not.toBeInTheDocument()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("shows the generic error when campaign creation itself fails", async () => {
    mockCreateCampaignMutateAsync.mockRejectedValueOnce(
      new Error("create failed"),
    )

    renderPage()

    fireEvent.change(screen.getByLabelText("Campaign Name *"), {
      target: { value: "Broken Campaign" },
    })
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "local" },
    })

    fireEvent.click(screen.getByRole("button", { name: /continue to review/i }))
    await screen.findByText("Review your campaign")

    fireEvent.click(screen.getByRole("button", { name: /continue to invite/i }))
    await screen.findByText("Add team members")

    fireEvent.click(screen.getByRole("button", { name: /^Create Campaign$/i }))

    await screen.findByText(
      "Failed to create campaign. Check your connection and try again.",
    )
  })
})
