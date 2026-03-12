import { describe, it } from "vitest"

describe("useVolunteerCampaignTags (VLTR-07)", () => {
  it.todo("fetches campaign volunteer tags list")
  it.todo("creates a new volunteer tag via POST")
  it.todo("updates a volunteer tag name via PATCH")
  it.todo("deletes a volunteer tag via DELETE")
})

describe("useAddTagToVolunteer / useRemoveTagFromVolunteer (VLTR-08)", () => {
  it.todo("adds tag to volunteer via POST /volunteers/{id}/tags/{tagId}")
  it.todo("removes tag from volunteer via DELETE /volunteers/{id}/tags/{tagId}")
  it.todo("invalidates volunteer detail query on tag mutation")
})
