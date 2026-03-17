import { describe, test, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

const mockDrive = vi.fn()
const mockDestroy = vi.fn()
vi.mock("driver.js", () => ({
  driver: vi.fn(() => ({ drive: mockDrive, destroy: mockDestroy })),
}))
vi.mock("@/styles/tour.css", () => ({}))
vi.mock("sonner", () => ({ toast: vi.fn() }))

import { useTour } from "@/hooks/useTour"
import { useTourStore } from "@/stores/tourStore"
import { driver } from "driver.js"

describe("useTour (TOUR-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTourStore.setState({
      isRunning: false,
      completions: {},
      sessionCounts: {},
      dismissedThisSession: {},
    })
  })

  describe("startSegment", () => {
    test("creates driver.js instance with provided steps", () => {
      const { result } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      expect(driver).toHaveBeenCalled()
      expect(mockDrive).toHaveBeenCalled()
    })

    test("calls setRunning(true) on start", () => {
      const { result } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      expect(useTourStore.getState().isRunning).toBe(true)
    })

    test("calls markComplete on destroy", () => {
      const { result } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      // Invoke the onDestroyed callback
      const driverCall = (driver as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
      act(() => {
        driverCall.onDestroyed()
      })
      expect(
        useTourStore.getState().completions["test-key"]?.welcome,
      ).toBe(true)
    })

    test("calls setRunning(false) on destroy", () => {
      const { result } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      expect(useTourStore.getState().isRunning).toBe(true)
      const driverCall = (driver as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
      act(() => {
        driverCall.onDestroyed()
      })
      expect(useTourStore.getState().isRunning).toBe(false)
    })
  })

  describe("cleanup", () => {
    test("destroys active driver instance on unmount", () => {
      const { result, unmount } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      unmount()
      expect(mockDestroy).toHaveBeenCalled()
    })

    test("sets isRunning to false on unmount", () => {
      const { result, unmount } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      expect(useTourStore.getState().isRunning).toBe(true)
      unmount()
      expect(useTourStore.getState().isRunning).toBe(false)
    })
  })

  describe("replacement", () => {
    test("destroys previous driver instance when starting new segment", () => {
      const { result } = renderHook(() => useTour("test-key"))
      act(() => {
        result.current.startSegment("welcome", [
          { element: "#a", popover: { title: "Hi" } },
        ])
      })
      act(() => {
        result.current.startSegment("canvassing", [
          { element: "#b", popover: { title: "Go" } },
        ])
      })
      // destroy is called: once when replacing, potentially again
      expect(mockDestroy).toHaveBeenCalled()
    })
  })
})
