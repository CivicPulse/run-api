import { describe, test } from "vitest"

// Hook import will be added once useTour.ts is created in Plan 01
// import { useTour } from "@/hooks/useTour"

describe("useTour (TOUR-02)", () => {
  describe("startSegment", () => {
    test.todo("creates driver.js instance with provided steps")
    test.todo("calls setRunning(true) on start")
    test.todo("calls markComplete on destroy")
    test.todo("calls setRunning(false) on destroy")
  })

  describe("cleanup", () => {
    test.todo("destroys active driver instance on unmount")
    test.todo("sets isRunning to false on unmount")
  })

  describe("replacement", () => {
    test.todo("destroys previous driver instance when starting new segment")
  })
})
