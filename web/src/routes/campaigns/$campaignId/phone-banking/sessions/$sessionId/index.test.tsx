import { describe, it } from "vitest"

describe("Session Detail", () => {
  describe("Status Transitions (PHON-02)", () => {
    it.todo("shows Activate button only for draft sessions")
    it.todo("shows Pause and Complete buttons for active sessions")
    it.todo("shows Resume and Complete buttons for paused sessions")
    it.todo("shows no transition buttons for completed sessions")
  })
  describe("Caller Management (PHON-03)", () => {
    it.todo("renders caller management table with assigned callers")
    it.todo("Add Caller triggers assignCaller mutation with selected user")
    it.todo("Remove Caller kebab action triggers removeCaller mutation")
  })
  describe("Check In / Check Out (PHON-04)", () => {
    it.todo("Check In button visible to volunteer role when session is active")
    it.todo("Start Calling button visible after check-in")
    it.todo("Check Out button visible to checked-in caller")
  })
  describe("Progress Tab (PHON-09, PHON-10)", () => {
    it.todo("progress bar shows completion percentage")
    it.todo("stat chips show Total, Completed, In Progress, Available counts")
    it.todo("per-caller table renders with Reassign kebab menu for managers")
    it.todo("reassign action opens reassign dialog (v1 limitation: entry IDs not available from progress endpoint)")
  })
})
