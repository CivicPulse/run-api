import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useFormGuard } from "./useFormGuard"

// Mock TanStack Router useBlocker
vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
}))

import { useBlocker } from "@tanstack/react-router"

const mockUseBlocker = useBlocker as unknown as ReturnType<typeof vi.fn>

function makeForm(isDirty: boolean) {
  return {
    formState: { isDirty },
  }
}

function makeBlockerResult(status: "idle" | "blocked", proceed?: () => void, reset?: () => void) {
  return { status, proceed, reset }
}

describe("useFormGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns isDirty from form state", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    expect(result.current.isDirty).toBe(true)
  })

  it("returns isDirty=false when form is clean", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(false) as any }))
    expect(result.current.isDirty).toBe(false)
  })

  it("isBlocked is true when blocker status is 'blocked'", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("blocked", vi.fn(), vi.fn()))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    expect(result.current.isBlocked).toBe(true)
  })

  it("isBlocked is false when blocker status is 'idle'", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(false) as any }))
    expect(result.current.isBlocked).toBe(false)
  })

  it("forwards proceed from useBlocker", () => {
    const proceed = vi.fn()
    mockUseBlocker.mockReturnValue(makeBlockerResult("blocked", proceed, vi.fn()))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    result.current.proceed()
    expect(proceed).toHaveBeenCalledOnce()
  })

  it("forwards reset from useBlocker", () => {
    const reset = vi.fn()
    mockUseBlocker.mockReturnValue(makeBlockerResult("blocked", vi.fn(), reset))
    const { result } = renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    result.current.reset()
    expect(reset).toHaveBeenCalledOnce()
  })

  it("calls useBlocker with shouldBlockFn that returns isDirty when dirty", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    const callArgs = mockUseBlocker.mock.calls[0][0]
    expect(callArgs.shouldBlockFn()).toBe(true)
  })

  it("calls useBlocker with shouldBlockFn that returns false when clean", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    renderHook(() => useFormGuard({ form: makeForm(false) as any }))
    const callArgs = mockUseBlocker.mock.calls[0][0]
    expect(callArgs.shouldBlockFn()).toBe(false)
  })

  it("calls useBlocker with enableBeforeUnload that returns isDirty when dirty", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    const callArgs = mockUseBlocker.mock.calls[0][0]
    expect(callArgs.enableBeforeUnload()).toBe(true)
  })

  it("calls useBlocker with enableBeforeUnload that returns false when clean", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    renderHook(() => useFormGuard({ form: makeForm(false) as any }))
    const callArgs = mockUseBlocker.mock.calls[0][0]
    expect(callArgs.enableBeforeUnload()).toBe(false)
  })

  it("calls useBlocker with withResolver: true", () => {
    mockUseBlocker.mockReturnValue(makeBlockerResult("idle"))
    renderHook(() => useFormGuard({ form: makeForm(true) as any }))
    const callArgs = mockUseBlocker.mock.calls[0][0]
    expect(callArgs.withResolver).toBe(true)
  })
})
