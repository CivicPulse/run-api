import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
  useUpdateShiftStatus,
  useSelfSignup,
  useCancelSignup,
  useAssignVolunteer,
  useCheckInVolunteer,
  useCheckOutVolunteer,
  useAdjustHours,
} from "./useShifts"

// Mock api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeQueryClientWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, invalidateSpy }
}

const mockShift = {
  id: "shift-1",
  campaign_id: "campaign-1",
  name: "Saturday Canvass",
  description: null,
  type: "canvassing",
  status: "scheduled",
  start_at: "2026-03-15T09:00:00Z",
  end_at: "2026-03-15T12:00:00Z",
  max_volunteers: 10,
  location_name: "City Hall",
  street: null,
  city: null,
  state: null,
  zip_code: null,
  latitude: null,
  longitude: null,
  turf_id: null,
  phone_bank_session_id: null,
  created_by: "user-1",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  signed_up_count: 0,
  waitlist_count: 0,
}

const mockSignupResponse = {
  id: "signup-1",
  shift_id: "shift-1",
  volunteer_id: "vol-1",
  status: "signed_up",
  waitlist_position: null,
  check_in_at: null,
  check_out_at: null,
  signed_up_at: "2026-03-01T00:00:00Z",
}

const mockCheckInResponse = {
  id: "signup-1",
  shift_id: "shift-1",
  volunteer_id: "vol-1",
  status: "checked_in",
  check_in_at: "2026-03-15T09:00:00Z",
  check_out_at: null,
  adjusted_hours: null,
  adjusted_by: null,
  adjusted_at: null,
  signed_up_at: "2026-03-01T00:00:00Z",
  hours: null,
}

describe("useShifts", () => {
  describe("SHFT-01: Create shift", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useCreateShift sends POST with all fields", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockShift),
      })

      const { result } = renderHook(() => useCreateShift("campaign-1"), {
        wrapper: makeWrapper(),
      })

      result.current.mutate({
        name: "Saturday Canvass",
        type: "canvassing",
        start_at: "2026-03-15T09:00:00Z",
        end_at: "2026-03-15T12:00:00Z",
        max_volunteers: 10,
        location_name: "City Hall",
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.post).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts",
        {
          json: {
            name: "Saturday Canvass",
            type: "canvassing",
            start_at: "2026-03-15T09:00:00Z",
            end_at: "2026-03-15T12:00:00Z",
            max_volunteers: 10,
            location_name: "City Hall",
          },
        },
      )
    })

    it("useCreateShift invalidates shift list on success", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockShift),
      })

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(() => useCreateShift("campaign-1"), {
        wrapper,
      })

      result.current.mutate({
        name: "Saturday Canvass",
        type: "canvassing",
        start_at: "2026-03-15T09:00:00Z",
        end_at: "2026-03-15T12:00:00Z",
        max_volunteers: 10,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["shifts", "campaign-1"] }),
      )
    })
  })

  describe("SHFT-02: Edit and delete shifts", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useUpdateShift sends PATCH with partial fields", async () => {
      mockApi.patch.mockReturnValue({
        json: vi.fn().mockResolvedValue({ ...mockShift, name: "Updated Name" }),
      })

      const { result } = renderHook(
        () => useUpdateShift("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate({ name: "Updated Name" })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.patch).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1",
        { json: { name: "Updated Name" } },
      )
    })

    it("useDeleteShift sends DELETE and invalidates list", async () => {
      mockApi.delete.mockReturnValue(Promise.resolve())

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(() => useDeleteShift("campaign-1"), {
        wrapper,
      })

      result.current.mutate("shift-1")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.delete).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1",
      )

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["shifts", "campaign-1"] }),
      )
    })
  })

  describe("SHFT-03: Status transitions", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useUpdateShiftStatus sends PATCH /status", async () => {
      mockApi.patch.mockReturnValue({
        json: vi.fn().mockResolvedValue({ ...mockShift, status: "active" }),
      })

      const { result } = renderHook(
        () => useUpdateShiftStatus("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate({ status: "active" })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.patch).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/status",
        { json: { status: "active" } },
      )
    })

    it("useUpdateShiftStatus invalidates detail on success", async () => {
      mockApi.patch.mockReturnValue({
        json: vi.fn().mockResolvedValue({ ...mockShift, status: "active" }),
      })

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(
        () => useUpdateShiftStatus("campaign-1", "shift-1"),
        { wrapper },
      )

      result.current.mutate({ status: "active" })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1"],
        }),
      )
    })
  })

  describe("SHFT-05: Self signup", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useSelfSignup sends POST /signup", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockSignupResponse),
      })

      const { result } = renderHook(
        () => useSelfSignup("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate()

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.post).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/signup",
      )
    })

    it("useSelfSignup invalidates shift and volunteers on success", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockSignupResponse),
      })

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(
        () => useSelfSignup("campaign-1", "shift-1"),
        { wrapper },
      )

      result.current.mutate()

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Invalidates all shifts
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["shifts", "campaign-1"] }),
      )
      // Invalidates detail
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1"],
        }),
      )
      // Invalidates volunteers roster
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1", "volunteers"],
        }),
      )
    })
  })

  describe("SHFT-06: Assign volunteer", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useAssignVolunteer sends POST /assign/{volunteerId}", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockSignupResponse),
      })

      const { result } = renderHook(
        () => useAssignVolunteer("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate("vol-1")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.post).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/assign/vol-1",
      )
    })

    it("useAssignVolunteer invalidates volunteers on success", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockSignupResponse),
      })

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(
        () => useAssignVolunteer("campaign-1", "shift-1"),
        { wrapper },
      )

      result.current.mutate("vol-1")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1", "volunteers"],
        }),
      )
    })
  })

  describe("SHFT-07: Check in/out", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useCheckInVolunteer sends POST /check-in/{volunteerId}", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue(mockCheckInResponse),
      })

      const { result } = renderHook(
        () => useCheckInVolunteer("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate("vol-1")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.post).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/check-in/vol-1",
      )
    })

    it("useCheckOutVolunteer sends POST /check-out/{volunteerId}", async () => {
      mockApi.post.mockReturnValue({
        json: vi.fn().mockResolvedValue({
          ...mockCheckInResponse,
          status: "checked_out",
          check_out_at: "2026-03-15T12:00:00Z",
        }),
      })

      const { result } = renderHook(
        () => useCheckOutVolunteer("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate("vol-1")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.post).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/check-out/vol-1",
      )
    })
  })

  describe("SHFT-09: Adjust hours", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useAdjustHours sends PATCH /hours with adjustment data", async () => {
      mockApi.patch.mockReturnValue({
        json: vi.fn().mockResolvedValue({
          ...mockCheckInResponse,
          adjusted_hours: 2.5,
          adjusted_by: "user-1",
          adjusted_at: "2026-03-15T13:00:00Z",
        }),
      })

      const { result } = renderHook(
        () => useAdjustHours("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate({
        volunteerId: "vol-1",
        data: {
          adjusted_hours: 2.5,
          adjustment_reason: "Volunteer stayed late",
        },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.patch).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/volunteers/vol-1/hours",
        {
          json: {
            adjusted_hours: 2.5,
            adjustment_reason: "Volunteer stayed late",
          },
        },
      )
    })
  })

  describe("SHFT-10: Cancel signup", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("useCancelSignup sends DELETE /signup", async () => {
      mockApi.delete.mockReturnValue(Promise.resolve())

      const { result } = renderHook(
        () => useCancelSignup("campaign-1", "shift-1"),
        { wrapper: makeWrapper() },
      )

      result.current.mutate()

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockApi.delete).toHaveBeenCalledWith(
        "api/v1/campaigns/campaign-1/shifts/shift-1/signup",
      )
    })

    it("useCancelSignup invalidates shift and volunteers on success", async () => {
      mockApi.delete.mockReturnValue(Promise.resolve())

      const { wrapper, invalidateSpy } = makeQueryClientWrapper()

      const { result } = renderHook(
        () => useCancelSignup("campaign-1", "shift-1"),
        { wrapper },
      )

      result.current.mutate()

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Invalidates all shifts
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["shifts", "campaign-1"] }),
      )
      // Invalidates detail
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1"],
        }),
      )
      // Invalidates volunteers roster
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["shifts", "campaign-1", "shift-1", "volunteers"],
        }),
      )
    })
  })
})
