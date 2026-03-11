import { describe, it } from "vitest"

describe("My Sessions", () => {
  it.todo("renders only sessions where current user is assigned caller")
  it.todo("shows Check In action for active sessions not yet checked in")
  it.todo("shows Resume Calling action for active sessions already checked in")
  it.todo("shows Checked Out state for sessions with check_out_at set")
  it.todo("shows empty state when no sessions assigned")
})
