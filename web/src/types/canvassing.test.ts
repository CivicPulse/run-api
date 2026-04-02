import { describe, expect, test } from "vitest"

import {
  groupByHousehold,
  isMappableEntry,
  isMappableHousehold,
  orderHouseholdsByDistance,
  orderHouseholdsBySequence,
  type CoordinatePoint,
  type EnrichedWalkListEntry,
} from "@/types/canvassing"

function entry(overrides: Partial<EnrichedWalkListEntry>): EnrichedWalkListEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    voter_id: overrides.voter_id ?? crypto.randomUUID(),
    household_key: overrides.household_key ?? null,
    sequence: overrides.sequence ?? 1,
    status: overrides.status ?? "pending",
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    voter: {
      first_name: "Test",
      last_name: "Voter",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "123 Main St",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "IL",
      registration_zip: "62701",
      ...overrides.voter,
    },
    prior_interactions: {
      attempt_count: 0,
      last_result: null,
      last_date: null,
      ...overrides.prior_interactions,
    },
  }
}

describe("canvassing household coordinate helpers", () => {
  test("identifies only full coordinate pairs as mappable entries", () => {
    expect(isMappableEntry(entry({ latitude: 42.1, longitude: -71.1 }))).toBe(true)
    expect(isMappableEntry(entry({ latitude: 42.1, longitude: null }))).toBe(false)
    expect(isMappableEntry(entry({ latitude: null, longitude: -71.1 }))).toBe(false)
  })

  test("groupByHousehold carries representative coordinates and sequence fallback", () => {
    const households = groupByHousehold([
      entry({ id: "b-1", household_key: "hh-b", sequence: 5, latitude: 42.31, longitude: -71.02, voter: { registration_line1: "500 Oak St" } }),
      entry({ id: "a-1", household_key: "hh-a", sequence: 2, latitude: null, longitude: null, voter: { registration_line1: "200 Main St" } }),
      entry({ id: "a-2", household_key: "hh-a", sequence: 3, latitude: 42.3, longitude: -71.0, voter: { registration_line1: "200 Main St" } }),
    ])

    expect(households.map((household) => household.householdKey)).toEqual(["hh-a", "hh-b"])
    expect(households[0].sequence).toBe(2)
    expect(households[0].latitude).toBe(42.3)
    expect(households[0].longitude).toBe(-71.0)
    expect(isMappableHousehold(households[0])).toBe(true)
  })

  test("orderHouseholdsBySequence keeps canonical stable order", () => {
    const households = groupByHousehold([
      entry({ id: "c", household_key: "hh-c", sequence: 3 }),
      entry({ id: "a", household_key: "hh-a", sequence: 1 }),
      entry({ id: "b", household_key: "hh-b", sequence: 2 }),
    ])

    expect(orderHouseholdsBySequence(households).map((household) => household.householdKey)).toEqual([
      "hh-a",
      "hh-b",
      "hh-c",
    ])
  })

  test("distance ordering falls back to sequence order when origin is unavailable", () => {
    const households = groupByHousehold([
      entry({ id: "two", household_key: "hh-2", sequence: 2, latitude: 42.32, longitude: -71.0 }),
      entry({ id: "one", household_key: "hh-1", sequence: 1, latitude: 42.31, longitude: -71.01 }),
    ])

    expect(orderHouseholdsByDistance(households, null).map((household) => household.householdKey)).toEqual([
      "hh-1",
      "hh-2",
    ])
  })

  test("distance ordering puts unmappable households after mappable ones and preserves sequence fallback", () => {
    const origin: CoordinatePoint = { latitude: 42.3005, longitude: -71.0005 }
    const households = groupByHousehold([
      entry({ id: "seq-3", household_key: "hh-3", sequence: 3, latitude: null, longitude: null, voter: { registration_line1: "300 Main St" } }),
      entry({ id: "seq-1", household_key: "hh-1", sequence: 1, latitude: 42.3008, longitude: -71.0008, voter: { registration_line1: "100 Main St" } }),
      entry({ id: "seq-2", household_key: "hh-2", sequence: 2, latitude: 42.3015, longitude: -71.0015, voter: { registration_line1: "200 Main St" } }),
      entry({ id: "seq-4", household_key: "hh-4", sequence: 4, latitude: null, longitude: 10, voter: { registration_line1: "400 Main St" } }),
    ])

    expect(orderHouseholdsByDistance(households, origin).map((household) => household.householdKey)).toEqual([
      "hh-1",
      "hh-2",
      "hh-3",
      "hh-4",
    ])
  })

  test("equal-distance households preserve sequence order deterministically", () => {
    const origin: CoordinatePoint = { latitude: 42, longitude: -71 }
    const households = groupByHousehold([
      entry({ id: "east", household_key: "hh-east", sequence: 2, latitude: 42, longitude: -70.99 }),
      entry({ id: "west", household_key: "hh-west", sequence: 1, latitude: 42, longitude: -71.01 }),
    ])

    expect(orderHouseholdsByDistance(households, origin).map((household) => household.householdKey)).toEqual([
      "hh-west",
      "hh-east",
    ])
  })

  test("all-unmappable households stay in sequence order", () => {
    const households = groupByHousehold([
      entry({ id: "third", household_key: "hh-3", sequence: 3, latitude: null, longitude: null }),
      entry({ id: "first", household_key: "hh-1", sequence: 1, latitude: null, longitude: 5 }),
      entry({ id: "second", household_key: "hh-2", sequence: 2, latitude: 5, longitude: null }),
    ])

    expect(orderHouseholdsByDistance(households, { latitude: 42, longitude: -71 }).map((household) => household.householdKey)).toEqual([
      "hh-1",
      "hh-2",
      "hh-3",
    ])
  })

  test("empty lists remain empty across ordering helpers", () => {
    expect(groupByHousehold([])).toEqual([])
    expect(orderHouseholdsBySequence([])).toEqual([])
    expect(orderHouseholdsByDistance([], { latitude: 42, longitude: -71 })).toEqual([])
  })
})
