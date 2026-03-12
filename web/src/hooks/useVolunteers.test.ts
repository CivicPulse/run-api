import { describe, it } from "vitest"

describe("useVolunteerList (VLTR-01)", () => {
  it.todo("fetches volunteers with no filters")
  it.todo("passes status filter as query param")
  it.todo("passes skills filter as comma-separated query param")
  it.todo("passes name search as query param")
})

describe("useCreateVolunteer (VLTR-02)", () => {
  it.todo("sends POST /volunteers with all fields")
  it.todo("invalidates volunteers query on success")
})

describe("useUpdateVolunteer (VLTR-03)", () => {
  it.todo("sends PATCH /volunteers/{id} with partial fields")
  it.todo("invalidates volunteer detail query on success")
})

describe("useUpdateVolunteerStatus (VLTR-03)", () => {
  it.todo("sends PATCH /volunteers/{id}/status")
  it.todo("invalidates volunteer list and detail queries on success")
})

describe("useSelfRegister (VLTR-05)", () => {
  it.todo("sends POST /volunteers/register")
  it.todo("returns volunteer_id from 409 response for redirect")
})

describe("useVolunteerDetail (VLTR-04)", () => {
  it.todo("fetches volunteer detail with tags and availability")
})
