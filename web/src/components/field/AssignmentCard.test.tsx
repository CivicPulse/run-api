import { describe, test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AssignmentCard } from "@/components/field/AssignmentCard"

// Mock TanStack Router Link to render a plain anchor tag with param substitution
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, className, ...rest }: {
    to: string
    params?: Record<string, string>
    children?: React.ReactNode
    className?: string
    [key: string]: unknown
  }) => {
    let href = to as string
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value as string)
      }
    }
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    )
  },
}))

const CAMPAIGN_ID = "campaign-123"

describe("AssignmentCard (NAV-02)", () => {
  test("canvassing card renders assignment name and links to canvassing route", () => {
    render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Downtown Walk List"
        total={50}
        completed={10}
        campaignId={CAMPAIGN_ID}
      />,
    )

    // Assignment name is visible
    expect(screen.getByText("Downtown Walk List")).toBeInTheDocument()

    // Links to the canvassing sub-route
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", `/field/${CAMPAIGN_ID}/canvassing`)
  })

  test("phone-banking card renders assignment name and links to phone-banking route", () => {
    render(
      <AssignmentCard
        type="phone-banking"
        id="session-1"
        name="Evening Call Session"
        total={100}
        completed={25}
        campaignId={CAMPAIGN_ID}
      />,
    )

    expect(screen.getByText("Evening Call Session")).toBeInTheDocument()

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", `/field/${CAMPAIGN_ID}/phone-banking`)
  })

  test("canvassing card shows progress text with door unit", () => {
    render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Walk List"
        total={47}
        completed={12}
        campaignId={CAMPAIGN_ID}
      />,
    )

    // Progress text shows count and "doors" unit
    expect(screen.getByText(/12 of 47 doors/)).toBeInTheDocument()
  })

  test("phone-banking card shows progress text with calls unit", () => {
    render(
      <AssignmentCard
        type="phone-banking"
        id="session-1"
        name="Call Session"
        total={100}
        completed={25}
        campaignId={CAMPAIGN_ID}
      />,
    )

    // Progress text shows count and "calls" unit
    expect(screen.getByText(/25 of 100 calls/)).toBeInTheDocument()
  })

  test("card renders progress bar element", () => {
    const { container } = render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Walk List"
        total={50}
        completed={10}
        campaignId={CAMPAIGN_ID}
      />,
    )

    // shadcn Progress renders as a div with role="progressbar" or a div with a value indicator
    // Progress bar is present in the DOM
    const progressEl = container.querySelector('[role="progressbar"]')
    expect(progressEl).toBeTruthy()
  })

  test("card renders 'Tap to start' call-to-action text", () => {
    render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Walk List"
        total={50}
        completed={10}
        campaignId={CAMPAIGN_ID}
      />,
    )

    expect(screen.getByText("Tap to start")).toBeInTheDocument()
  })

  test("card has minimum height class for tappable surface (min-h-[100px])", () => {
    render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Walk List"
        total={50}
        completed={10}
        campaignId={CAMPAIGN_ID}
      />,
    )

    const link = screen.getByRole("link")
    expect(link.className).toContain("min-h-[100px]")
  })

  test("entire card surface is the tappable link, not just a button inside a card", () => {
    render(
      <AssignmentCard
        type="canvassing"
        id="wl-1"
        name="Walk List"
        total={50}
        completed={10}
        campaignId={CAMPAIGN_ID}
      />,
    )

    // The link wraps everything — it's the outermost element
    const link = screen.getByRole("link")
    expect(link.tagName.toLowerCase()).toBe("a")
    // Name and progress are inside the link
    expect(link).toHaveTextContent("Walk List")
    expect(link).toHaveTextContent("Tap to start")
  })

  test("zero-total assignment shows 0% progress without divide-by-zero error", () => {
    // Should not throw when total is 0
    expect(() =>
      render(
        <AssignmentCard
          type="canvassing"
          id="wl-1"
          name="Empty Walk List"
          total={0}
          completed={0}
          campaignId={CAMPAIGN_ID}
        />,
      ),
    ).not.toThrow()

    expect(screen.getByText(/0 of 0 doors/)).toBeInTheDocument()
  })
})
