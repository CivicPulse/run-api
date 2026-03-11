import { describe, it } from "vitest"

describe("Active Calling Screen", () => {
  describe("Claim Lifecycle (PHON-05)", () => {
    it.todo("shows idle state with Start Calling button on load")
    it.todo("Start Calling triggers claim mutation with batch_size 1")
    it.todo("shows voter info after successful claim")
    it.todo("shows completion message when claim returns empty array")
  })
  describe("Voter Info + Survey (PHON-06)", () => {
    it.todo("left panel shows voter name, phone numbers, and address")
    it.todo("right panel shows survey questions when script_id is present")
    it.todo("right panel shows no survey section when script_id is null")
  })
  describe("Outcome Recording (PHON-07)", () => {
    it.todo("outcome button click submits record call mutation")
    it.todo("shows Call recorded confirmation after successful outcome")
    it.todo("Next Voter button triggers new claim")
    it.todo("survey responses sent only when result_code is answered")
  })
  describe("Skip Behavior (PHON-08)", () => {
    it.todo("Skip button calls self-release endpoint without recording outcome")
    it.todo("Skip returns caller to idle state ready for next claim")
  })
})
