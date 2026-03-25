import { describe, it, expect } from "vitest"
import { formatPhoneDisplay, getPhoneStatus, CALL_OUTCOME_CONFIGS } from "./calling"

describe("formatPhoneDisplay", () => {
  it("formats US E.164 number to display format", () => {
    expect(formatPhoneDisplay("+15551234567")).toBe("(555) 123-4567")
  })

  it("formats number with country code 1 prefix", () => {
    expect(formatPhoneDisplay("+12025551234")).toBe("(202) 555-1234")
  })

  it("returns original string for non-US numbers", () => {
    expect(formatPhoneDisplay("+442071234567")).toBe("+442071234567")
  })

  it("returns original string for short numbers", () => {
    expect(formatPhoneDisplay("555")).toBe("555")
  })

  it("handles number without + prefix", () => {
    expect(formatPhoneDisplay("15551234567")).toBe("(555) 123-4567")
  })

  it("formats 10-digit US number without country code", () => {
    expect(formatPhoneDisplay("4789601978")).toBe("(478) 960-1978")
  })
})

describe("getPhoneStatus", () => {
  it("returns no prior tries for null attempts", () => {
    const status = getPhoneStatus("+15551234567", null)
    expect(status).toEqual({ isTerminal: false, priorTries: 0, lastResult: null })
  })

  it("returns no prior tries for phone not in attempts", () => {
    const status = getPhoneStatus("+15551234567", { "+15559999999": { result: "no_answer", at: "2026-03-10" } })
    expect(status).toEqual({ isTerminal: false, priorTries: 0, lastResult: null })
  })

  it("returns terminal for wrong_number", () => {
    const status = getPhoneStatus("+15551234567", { "+15551234567": { result: "wrong_number", at: "2026-03-10" } })
    expect(status.isTerminal).toBe(true)
    expect(status.priorTries).toBe(1)
    expect(status.lastResult).toBe("wrong_number")
  })

  it("returns terminal for disconnected", () => {
    const status = getPhoneStatus("+15551234567", { "+15551234567": { result: "disconnected", at: "2026-03-10" } })
    expect(status.isTerminal).toBe(true)
  })

  it("returns non-terminal for no_answer", () => {
    const status = getPhoneStatus("+15551234567", { "+15551234567": { result: "no_answer", at: "2026-03-10" } })
    expect(status.isTerminal).toBe(false)
    expect(status.priorTries).toBe(1)
  })
})

describe("CALL_OUTCOME_CONFIGS", () => {
  it("has 8 outcomes", () => {
    expect(CALL_OUTCOME_CONFIGS).toHaveLength(8)
  })

  it("has correct order: answered, no_answer, busy, voicemail, wrong_number, refused, deceased, disconnected", () => {
    const codes = CALL_OUTCOME_CONFIGS.map((c) => c.code)
    expect(codes).toEqual([
      "answered", "no_answer", "busy", "voicemail",
      "wrong_number", "refused", "deceased", "disconnected",
    ])
  })

  it("answered has green color", () => {
    const answered = CALL_OUTCOME_CONFIGS.find((c) => c.code === "answered")
    expect(answered?.color.bg).toBe("bg-status-success")
  })
})
