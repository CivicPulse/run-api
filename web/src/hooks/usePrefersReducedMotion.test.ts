import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { usePrefersReducedMotion } from "./usePrefersReducedMotion"

type Listener = (event: MediaQueryListEvent) => void

function installMatchMediaMock(initialMatches: boolean) {
  let listener: Listener | null = null
  const mq = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_: string, l: Listener) => {
      listener = l
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => mq),
  })
  return {
    mq,
    fire: (matches: boolean) => listener?.({ matches } as MediaQueryListEvent),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("usePrefersReducedMotion", () => {
  it("returns false when media query does not match", () => {
    installMatchMediaMock(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it("returns true when media query matches on mount", () => {
    installMatchMediaMock(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it("updates when the change event fires", () => {
    const { fire } = installMatchMediaMock(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    act(() => fire(true))
    expect(result.current).toBe(true)
  })

  it("cleans up the listener on unmount", () => {
    const { mq } = installMatchMediaMock(false)
    const { unmount } = renderHook(() => usePrefersReducedMotion())
    unmount()
    expect(mq.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
  })

  it("is SSR-safe when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    })
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })
})
