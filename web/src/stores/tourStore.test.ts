import { describe, test, expect, beforeEach } from "vitest"

// Store import will be added once tourStore.ts is created in Plan 01
// import { useTourStore, tourKey } from "@/stores/tourStore"

describe("tourStore", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe("tourKey", () => {
    test.todo("builds key from campaignId and userId")
  })

  describe("completions (TOUR-03)", () => {
    test.todo("markComplete sets segment to true for given key")
    test.todo("isSegmentComplete returns false for unknown key")
    test.todo("isSegmentComplete returns true after markComplete")
    test.todo("completion state persists to localStorage")
    test.todo("completion state survives store rehydration")
  })

  describe("sessionCounts (TOUR-06)", () => {
    test.todo("incrementSession starts at 1 for new key")
    test.todo("incrementSession increments existing count")
    test.todo("getSessionCount returns 0 for unknown key")
    test.todo("sessionCounts persist to localStorage")
  })

  describe("shouldShowQuickStart (TOUR-06)", () => {
    test.todo("returns true when session count < 3 and not dismissed and not running")
    test.todo("returns false when session count >= 3")
    test.todo("returns false when dismissed this session")
    test.todo("returns false when tour is running")
  })

  describe("transient state", () => {
    test.todo("isRunning defaults to false")
    test.todo("isRunning is NOT persisted to localStorage")
    test.todo("dismissedThisSession is NOT persisted to localStorage")
  })
})
