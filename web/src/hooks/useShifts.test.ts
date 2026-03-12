import { describe, it } from "vitest"

describe("useShifts", () => {
  describe("SHFT-01: Create shift", () => {
    it.todo("useCreateShift sends POST with all fields")
    it.todo("useCreateShift invalidates shift list on success")
  })

  describe("SHFT-02: Edit and delete shifts", () => {
    it.todo("useUpdateShift sends PATCH with partial fields")
    it.todo("useDeleteShift sends DELETE and invalidates list")
  })

  describe("SHFT-03: Status transitions", () => {
    it.todo("useUpdateShiftStatus sends PATCH /status")
    it.todo("useUpdateShiftStatus invalidates detail on success")
  })

  describe("SHFT-05: Self signup", () => {
    it.todo("useSelfSignup sends POST /signup")
    it.todo("useSelfSignup invalidates shift and volunteers on success")
  })

  describe("SHFT-06: Assign volunteer", () => {
    it.todo("useAssignVolunteer sends POST /assign/{volunteerId}")
    it.todo("useAssignVolunteer invalidates volunteers on success")
  })

  describe("SHFT-07: Check in/out", () => {
    it.todo("useCheckInVolunteer sends POST /check-in/{volunteerId}")
    it.todo("useCheckOutVolunteer sends POST /check-out/{volunteerId}")
  })

  describe("SHFT-09: Adjust hours", () => {
    it.todo("useAdjustHours sends PATCH /hours with adjustment data")
  })

  describe("SHFT-10: Cancel signup", () => {
    it.todo("useCancelSignup sends DELETE /signup")
    it.todo("useCancelSignup invalidates shift and volunteers on success")
  })
})
