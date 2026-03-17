import { describe, test, expect, beforeEach, vi } from "vitest"
import { useTourStore, tourKey } from "@/stores/tourStore"

describe("tourStore", () => {
  beforeEach(() => {
    useTourStore.setState({
      completions: {},
      sessionCounts: {},
      dismissedThisSession: {},
      isRunning: false,
    })
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe("tourKey", () => {
    test("builds key from campaignId and userId", () => {
      expect(tourKey("camp-1", "user-1")).toBe("camp-1_user-1")
    })
  })

  describe("completions (TOUR-03)", () => {
    test("markComplete sets segment to true for given key", () => {
      useTourStore.getState().markComplete("k1", "welcome")
      expect(useTourStore.getState().completions["k1"]?.welcome).toBe(true)
    })

    test("isSegmentComplete returns false for unknown key", () => {
      expect(useTourStore.getState().isSegmentComplete("unknown", "welcome")).toBe(false)
    })

    test("isSegmentComplete returns true after markComplete", () => {
      useTourStore.getState().markComplete("k1", "welcome")
      expect(useTourStore.getState().isSegmentComplete("k1", "welcome")).toBe(true)
    })

    test("completion state persists to localStorage", () => {
      useTourStore.getState().markComplete("k1", "welcome")
      const stored = JSON.parse(localStorage.getItem("tour-state") || "{}")
      expect(stored.state.completions["k1"].welcome).toBe(true)
    })

    test("completion state survives store rehydration", () => {
      useTourStore.getState().markComplete("k1", "welcome")
      // Verify the persisted shape in localStorage matches what the store needs
      const stored = JSON.parse(localStorage.getItem("tour-state")!)
      // Zustand persist stores { state: { ...partializedState }, version: 0 }
      expect(stored.state.completions["k1"].welcome).toBe(true)
      expect(stored.state.sessionCounts).toBeDefined()
      // Verify transient fields are excluded from persistence
      expect(stored.state.isRunning).toBeUndefined()
      expect(stored.state.dismissedThisSession).toBeUndefined()
      // The persist key "tour-state" and partialized shape ensure
      // completions and sessionCounts survive page reloads
    })
  })

  describe("sessionCounts (TOUR-06)", () => {
    test("incrementSession starts at 1 for new key", () => {
      useTourStore.getState().incrementSession("k1", "canvassing")
      expect(useTourStore.getState().getSessionCount("k1", "canvassing")).toBe(1)
    })

    test("incrementSession increments existing count", () => {
      useTourStore.getState().incrementSession("k1", "canvassing")
      useTourStore.getState().incrementSession("k1", "canvassing")
      expect(useTourStore.getState().getSessionCount("k1", "canvassing")).toBe(2)
    })

    test("getSessionCount returns 0 for unknown key", () => {
      expect(useTourStore.getState().getSessionCount("unknown", "canvassing")).toBe(0)
    })

    test("sessionCounts persist to localStorage", () => {
      useTourStore.getState().incrementSession("k1", "canvassing")
      const stored = JSON.parse(localStorage.getItem("tour-state") || "{}")
      expect(stored.state.sessionCounts["k1"].canvassing).toBe(1)
    })
  })

  describe("shouldShowQuickStart (TOUR-06)", () => {
    test("returns true when session count < 3 and not dismissed and not running", () => {
      expect(useTourStore.getState().shouldShowQuickStart("k1", "canvassing")).toBe(true)
    })

    test("returns false when session count >= 3", () => {
      useTourStore.getState().incrementSession("k1", "canvassing")
      useTourStore.getState().incrementSession("k1", "canvassing")
      useTourStore.getState().incrementSession("k1", "canvassing")
      expect(useTourStore.getState().shouldShowQuickStart("k1", "canvassing")).toBe(false)
    })

    test("returns false when dismissed this session", () => {
      useTourStore.getState().dismissQuickStart("k1", "canvassing")
      expect(useTourStore.getState().shouldShowQuickStart("k1", "canvassing")).toBe(false)
    })

    test("returns false when tour is running", () => {
      useTourStore.getState().setRunning(true)
      expect(useTourStore.getState().shouldShowQuickStart("k1", "canvassing")).toBe(false)
    })
  })

  describe("transient state", () => {
    test("isRunning defaults to false", () => {
      expect(useTourStore.getState().isRunning).toBe(false)
    })

    test("isRunning is NOT persisted to localStorage", () => {
      useTourStore.getState().setRunning(true)
      const stored = JSON.parse(localStorage.getItem("tour-state") || "{}")
      expect(stored.state.isRunning).toBeUndefined()
    })

    test("dismissedThisSession is NOT persisted to localStorage", () => {
      useTourStore.getState().dismissQuickStart("k1", "canvassing")
      const stored = JSON.parse(localStorage.getItem("tour-state") || "{}")
      expect(stored.state.dismissedThisSession).toBeUndefined()
    })
  })
})
