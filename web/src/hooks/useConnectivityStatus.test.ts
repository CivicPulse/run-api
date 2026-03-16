import { describe, test, expect, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"

describe("useConnectivityStatus", () => {
  let originalOnLine: boolean

  afterEach(() => {
    // Restore original navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  test("returns true when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useConnectivityStatus())
    expect(result.current).toBe(true)
  })

  test("returns false when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useConnectivityStatus())
    expect(result.current).toBe(false)
  })

  test("updates when online event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useConnectivityStatus())
    expect(result.current).toBe(false)

    act(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("online"))
    })

    expect(result.current).toBe(true)
  })

  test("updates when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useConnectivityStatus())
    expect(result.current).toBe(true)

    act(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("offline"))
    })

    expect(result.current).toBe(false)
  })
})
