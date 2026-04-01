import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"

const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))
const mockUseParams = vi.hoisted(() => vi.fn(() => ({ campaignId: "campaign-b" })))
const mockUseNavigate = vi.hoisted(() => vi.fn())
const mockUseVoterSearch = vi.hoisted(() => vi.fn())
const mockUseDeleteVoter = vi.hoisted(() => vi.fn())
const mockUseCreateVoter = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  useParams: mockUseParams,
  useNavigate: () => mockUseNavigate,
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    [key: string]: unknown
  }) => <a href={typeof to === "string" ? to : "#"} data-params={JSON.stringify(params ?? {})} {...(props as object)}>{children}</a>,
}))

vi.mock("@/hooks/useVoters", () => ({
  useVoterSearch: mockUseVoterSearch,
  useDeleteVoter: mockUseDeleteVoter,
  useCreateVoter: mockUseCreateVoter,
}))

vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    data,
    emptyTitle,
    emptyDescription,
    isLoading,
  }: {
    data: Array<Record<string, unknown>>
    emptyTitle?: string
    emptyDescription?: string
    isLoading?: boolean
  }) => {
    if (isLoading) return <div>Loading...</div>
    if (data.length === 0) {
      return (
        <div>
          <div>{emptyTitle}</div>
          <div>{emptyDescription}</div>
        </div>
      )
    }
    return (
      <div>
        {data.map((row) => (
          <div key={String(row.id)}>{[row.first_name, row.last_name].filter(Boolean).join(" ")}</div>
        ))}
      </div>
    )
  },
}))

vi.mock("@/components/shared/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/components/voters/VoterFilterBuilder", () => ({
  VoterFilterBuilder: () => <div>Filter Builder</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import "./index"

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("VotersPage component not captured")
  return render(<Component />)
}

describe("VotersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDeleteVoter.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    mockUseCreateVoter.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
  })

  it("shows an error and clears stale rows when the active campaign voter query fails", () => {
    mockUseVoterSearch.mockReturnValue({
      data: {
        items: [
          { id: "voter-a", first_name: "Mary", last_name: "Hoskins" },
        ],
        pagination: { has_more: true, next_cursor: "cursor-1" },
      },
      isLoading: false,
      isError: true,
      error: new Error("Authentication required"),
    })

    renderPage()

    expect(screen.getByText(/your session expired while loading voters/i)).toBeInTheDocument()
    expect(screen.getByText(/no voters yet/i)).toBeInTheDocument()
    expect(screen.queryByText("Mary Hoskins")).not.toBeInTheDocument()
  })
})
