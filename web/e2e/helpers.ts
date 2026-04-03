import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import type { Page, APIResponse } from "@playwright/test"

const LOCAL_AUTH_DIR = path.join(import.meta.dirname, "../playwright/.auth")

function resolveSharedAuthDir(): string | null {
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim()
    const repoRoot = path.resolve(gitCommonDir, "..")
    return path.join(repoRoot, "web/playwright/.auth")
  } catch {
    return null
  }
}

const SHARED_AUTH_DIR = resolveSharedAuthDir()

export function resolveAuthStatePath(role: string): string {
  const localFile = path.join(LOCAL_AUTH_DIR, `${role}.json`)
  if (fs.existsSync(localFile)) return localFile

  if (SHARED_AUTH_DIR) {
    const sharedFile = path.join(SHARED_AUTH_DIR, `${role}.json`)
    if (fs.existsSync(sharedFile)) return sharedFile
  }

  return localFile
}

/**
 * Get the seed campaign ID without navigating into it.
 * Uses the /me/campaigns API to find the seed campaign by name.
 */
export async function getSeedCampaignId(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") &&
      !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  await page.waitForLoadState("domcontentloaded")

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const token = await getAuthToken(page)
      const resp = await page.request.get("/api/v1/me/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok()) {
        const campaigns = await resp.json()
        const seed = campaigns.find(
          (c: { campaign_name?: string; name?: string }) =>
            /macon.?bibb/i.test(c.campaign_name ?? c.name ?? ""),
        )
        if (seed?.campaign_id ?? seed?.id) return seed.campaign_id ?? seed.id
      }
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    } catch {
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    }
  }

  const campaignLink = page
    .getByRole("link", { name: /macon-bibb/i })
    .first()
  await campaignLink.waitFor({ state: "visible", timeout: 30_000 })
  const href = await campaignLink.getAttribute("href")
  const match = href?.match(/campaigns\/([a-f0-9-]+)/)
  if (!match) throw new Error("Could not find seed campaign ID from card link")
  return match[1]
}

export async function getAuthToken(page: Page): Promise<string> {
  let fromLocalStorage = ""
  try {
    fromLocalStorage = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (
          key.startsWith("oidc.user:") ||
          key.startsWith("oidc.") ||
          key.includes("oidc")
        ) {
          try {
            const user = JSON.parse(localStorage.getItem(key)!)
            if (user?.access_token) return user.access_token as string
          } catch {
            // skip malformed values
          }
        }
      }
      return ""
    })
  } catch {
    // about:blank or cross-origin; fall through to storageState lookup
  }

  if (fromLocalStorage) {
    return fromLocalStorage
  }

  const storageState = await page.context().storageState()
  for (const origin of storageState.origins) {
    for (const ls of origin.localStorage) {
      if (
        ls.name.startsWith("oidc.user:") ||
        ls.name.startsWith("oidc.") ||
        ls.name.includes("oidc")
      ) {
        try {
          const parsed = JSON.parse(ls.value)
          if (parsed?.access_token) {
            return parsed.access_token as string
          }
        } catch {
          // continue searching
        }
      }
    }
  }

  throw new Error("No OIDC access token found in localStorage or storageState")
}

export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await getAuthToken(page)
  return { Authorization: `Bearer ${token}` }
}

export async function apiGet(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.get(url, { headers: await authHeaders(page), timeout })
}

export async function apiPost(
  page: Page,
  url: string,
  data?: unknown,
  timeout = 60_000,
): Promise<APIResponse> {
  return page.request.post(url, {
    data,
    headers: await authHeaders(page),
    timeout,
  })
}

export async function apiPatch(
  page: Page,
  url: string,
  data?: unknown,
  timeout = 60_000,
): Promise<APIResponse> {
  return page.request.patch(url, {
    data,
    headers: await authHeaders(page),
    timeout,
  })
}

export async function apiDelete(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.delete(url, {
    headers: await authHeaders(page),
    timeout,
  })
}

export async function apiPostWithRetry(
  page: Page,
  url: string,
  data?: unknown,
  maxRetries = 3,
): Promise<APIResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await apiPost(page, url, data)
    if (resp.ok() || resp.status() < 500) return resp
    if (attempt < maxRetries - 1) await page.waitForTimeout(3_000 * (attempt + 1))
  }
  return apiPost(page, url, data)
}

export interface DisposablePhoneBankFixture {
  voterId: string
  callListId: string
  sessionId: string
  phoneNumber: string
  sessionName: string
}

export interface DisposableCanvassingSurveyFixture {
  turfId: string
  walkListId: string
  walkListName: string
  scriptId: string
  scriptTitle: string
  entryCount: number
  orderedAddresses: string[]
  revisitAddress: string
}

export interface DisposableMappedCanvassingFixture {
  turfId: string
  walkListId: string
  walkListName: string
  orderedAddresses: string[]
  partiallyMappedAddress: string
  volunteerLocation: {
    latitude: number
    longitude: number
  }
}

export async function createDisposablePhoneBankFixture(
  page: Page,
  campaignId: string,
  callerUserId: string,
  labelPrefix = "E2E PB Fixture",
): Promise<DisposablePhoneBankFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const phoneNumber = `555${Math.floor(1_000_000 + Math.random() * 9_000_000)}`

  const voterResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/voters`,
    {
      first_name: "Fixture",
      last_name: `Phone${suffix}`,
      party: "IND",
    },
  )
  if (!voterResp.ok()) {
    throw new Error(`Fixture voter create failed: ${voterResp.status()} ${await voterResp.text()}`)
  }
  const voterId = (await voterResp.json()).id as string

  const phoneResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/voters/${voterId}/phones`,
    {
      value: phoneNumber,
      type: "mobile",
      is_primary: true,
      source: "manual",
    },
  )
  if (!phoneResp.ok()) {
    throw new Error(`Fixture phone add failed: ${phoneResp.status()} ${await phoneResp.text()}`)
  }

  const callListResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/call-lists`,
    {
      name: `${labelPrefix} Call List ${suffix}`,
      max_attempts: 3,
      claim_timeout_minutes: 30,
      cooldown_minutes: 60,
    },
  )
  if (!callListResp.ok()) {
    throw new Error(`Fixture call list create failed: ${callListResp.status()} ${await callListResp.text()}`)
  }
  const callListId = (await callListResp.json()).id as string

  const activateCallListResp = await apiPatch(
    page,
    `/api/v1/campaigns/${campaignId}/call-lists/${callListId}?new_status=active`,
    {},
  )
  if (!activateCallListResp.ok()) {
    throw new Error(
      `Fixture call list activation failed: ${activateCallListResp.status()} ${await activateCallListResp.text()}`,
    )
  }

  const sessionName = `${labelPrefix} Session ${suffix}`
  const sessionResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions`,
    {
      name: sessionName,
      call_list_id: callListId,
    },
  )
  if (!sessionResp.ok()) {
    throw new Error(
      `Fixture phone session create failed: ${sessionResp.status()} ${await sessionResp.text()}`,
    )
  }
  const sessionId = (await sessionResp.json()).id as string

  const activateSessionResp = await apiPatch(
    page,
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`,
    { status: "active" },
  )
  if (!activateSessionResp.ok()) {
    throw new Error(
      `Fixture phone session activation failed: ${activateSessionResp.status()} ${await activateSessionResp.text()}`,
    )
  }

  const assignCallerResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`,
    { user_id: callerUserId },
  )
  if (!assignCallerResp.ok() && assignCallerResp.status() !== 409) {
    throw new Error(
      `Fixture caller assignment failed: ${assignCallerResp.status()} ${await assignCallerResp.text()}`,
    )
  }

  return {
    voterId,
    callListId,
    sessionId,
    phoneNumber,
    sessionName,
  }
}

export async function createDisposableCanvassingSurveyFixture(
  page: Page,
  campaignId: string,
  volunteerUserId: string,
  labelPrefix = "E2E FIELD-07 Fixture",
): Promise<DisposableCanvassingSurveyFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const existingWalkListsResp = await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists?limit=200`,
  )
  if (existingWalkListsResp.ok()) {
    const payload = (await existingWalkListsResp.json()) as {
      items?: Array<{ id: string }>
    } | Array<{ id: string }>
    const walkLists = Array.isArray(payload) ? payload : (payload.items ?? [])

    for (const wl of walkLists) {
      const removeResp = await apiDelete(
        page,
        `/api/v1/campaigns/${campaignId}/walk-lists/${wl.id}/canvassers/${volunteerUserId}`,
      )
      if (!removeResp.ok() && removeResp.status() !== 404) {
        throw new Error(
          `Fixture canvasser reset failed: ${removeResp.status()} ${await removeResp.text()}`,
        )
      }
    }
  }

  const surveyResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/surveys`,
    {
      title: `${labelPrefix} Survey ${suffix}`,
      description: "Deterministic FIELD canvassing survey fixture",
    },
  )
  if (!surveyResp.ok()) {
    throw new Error(
      `Fixture survey create failed: ${surveyResp.status()} ${await surveyResp.text()}`,
    )
  }
  const survey = await surveyResp.json()
  const scriptId = survey.id as string
  const scriptTitle = survey.title as string

  const questionResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions`,
    {
      question_text: "Should we count on your support this election?",
      question_type: "multiple_choice",
      options: {
        choices: ["Yes", "No", "Undecided"],
      },
    },
  )
  if (!questionResp.ok()) {
    throw new Error(
      `Fixture survey question create failed: ${questionResp.status()} ${await questionResp.text()}`,
    )
  }

  const activateSurveyResp = await apiPatch(
    page,
    `/api/v1/campaigns/${campaignId}/surveys/${scriptId}`,
    { status: "active" },
  )
  if (!activateSurveyResp.ok()) {
    throw new Error(
      `Fixture survey activation failed: ${activateSurveyResp.status()} ${await activateSurveyResp.text()}`,
    )
  }

  const baseLatitude = 36 + Math.random()
  const baseLongitude = -83 + Math.random()
  const revisitAddress = "200 Survey Ave"
  const voterConfigs = [
    {
      address: "100 Survey Ave",
      latitude: baseLatitude + 0.0005,
      longitude: baseLongitude + 0.0005,
      residents: ["Casey", "Jordan"],
    },
    {
      address: revisitAddress,
      latitude: baseLatitude + 0.003,
      longitude: baseLongitude + 0.003,
      residents: ["Taylor"],
    },
    {
      address: "300 Survey Ave",
      latitude: baseLatitude + 0.006,
      longitude: baseLongitude + 0.006,
      residents: ["Morgan"],
    },
  ]

  for (const [addressIndex, voterConfig] of voterConfigs.entries()) {
    for (const [residentIndex, residentFirstName] of voterConfig.residents.entries()) {
      const voterResp = await apiPostWithRetry(
        page,
        `/api/v1/campaigns/${campaignId}/voters`,
        {
          first_name: residentFirstName,
          last_name: `${labelPrefix.replace(/\s+/g, "")}${suffix}${addressIndex}${residentIndex}`,
          party: "IND",
          registration_line1: voterConfig.address,
          registration_city: "Testville",
          registration_state: "GA",
          registration_zip: "30000",
          latitude: voterConfig.latitude,
          longitude: voterConfig.longitude,
        },
      )
      if (!voterResp.ok()) {
        throw new Error(
          `Fixture voter create failed: ${voterResp.status()} ${await voterResp.text()}`,
        )
      }
    }
  }

  const turfResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/turfs`,
    {
      name: `${labelPrefix} Turf ${suffix}`,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [baseLongitude - 0.01, baseLatitude - 0.01],
            [baseLongitude + 0.02, baseLatitude - 0.01],
            [baseLongitude + 0.02, baseLatitude + 0.02],
            [baseLongitude - 0.01, baseLatitude + 0.02],
            [baseLongitude - 0.01, baseLatitude - 0.01],
          ],
        ],
      },
    },
  )
  if (!turfResp.ok()) {
    throw new Error(
      `Fixture turf create failed: ${turfResp.status()} ${await turfResp.text()}`,
    )
  }
  const turfId = (await turfResp.json()).id as string

  const walkListName = `${labelPrefix} Walk List ${suffix}`
  const walkListResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists`,
    {
      turf_id: turfId,
      script_id: scriptId,
      name: walkListName,
    },
  )
  if (!walkListResp.ok()) {
    throw new Error(
      `Fixture walk list create failed: ${walkListResp.status()} ${await walkListResp.text()}`,
    )
  }
  const walkListId = (await walkListResp.json()).id as string

  const assignResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`,
    { user_id: volunteerUserId },
  )
  if (!assignResp.ok() && assignResp.status() !== 409) {
    throw new Error(
      `Fixture canvasser assignment failed: ${assignResp.status()} ${await assignResp.text()}`,
    )
  }

  const entriesResp = await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries/enriched`,
  )
  if (!entriesResp.ok()) {
    throw new Error(
      `Fixture walk list entries check failed: ${entriesResp.status()} ${await entriesResp.text()}`,
    )
  }
  const entries = (await entriesResp.json()) as Array<{
    voter: { registration_line1?: string | null }
  }>
  const entryCount = entries.length
  if (entryCount < 4) {
    throw new Error(
      `Fixture walk list has too few entries for canvassing proof: ${walkListId} (${entryCount}).`,
    )
  }

  const orderedAddresses = Array.from(
    new Set(entries.map((entry) => entry.voter.registration_line1 ?? "")),
  ).filter(Boolean)

  if (orderedAddresses.join("|") !== voterConfigs.map((voter) => voter.address).join("|")) {
    throw new Error(`Fixture address order mismatch: ${orderedAddresses.join(", ")}`)
  }

  return {
    turfId,
    walkListId,
    walkListName,
    scriptId,
    scriptTitle,
    entryCount,
    orderedAddresses,
    revisitAddress,
  }
}

export async function createDisposableMappedCanvassingFixture(
  page: Page,
  campaignId: string,
  volunteerUserId: string,
  labelPrefix = "E2E FIELD-11 Fixture",
): Promise<DisposableMappedCanvassingFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const existingWalkListsResp = await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists?limit=200`,
  )
  if (existingWalkListsResp.ok()) {
    const payload = (await existingWalkListsResp.json()) as {
      items?: Array<{ id: string }>
    } | Array<{ id: string }>
    const walkLists = Array.isArray(payload) ? payload : (payload.items ?? [])

    for (const wl of walkLists) {
      const removeResp = await apiDelete(
        page,
        `/api/v1/campaigns/${campaignId}/walk-lists/${wl.id}/canvassers/${volunteerUserId}`,
      )
      if (!removeResp.ok() && removeResp.status() !== 404) {
        throw new Error(
          `Mapped fixture canvasser reset failed: ${removeResp.status()} ${await removeResp.text()}`,
        )
      }
    }
  }

  const baseLatitude = 35 + Math.random()
  const baseLongitude = -84 + Math.random()
  const voterConfigs = [
    {
      address: "100 Alpha St",
      latitude: baseLatitude + 0.0005,
      longitude: baseLongitude + 0.0005,
    },
    {
      address: "200 Bravo St",
      latitude: baseLatitude + 0.006,
      longitude: baseLongitude + 0.006,
    },
    {
      address: "300 Charlie St",
      latitude: baseLatitude + 0.0105,
      longitude: baseLongitude + 0.0105,
    },
  ]

  const createdVoters: Array<{ id: string; address: string }> = []

  for (const [index, voter] of voterConfigs.entries()) {
    const voterResp = await apiPostWithRetry(
      page,
      `/api/v1/campaigns/${campaignId}/voters`,
      {
        first_name: "Fixture",
        last_name: `${labelPrefix.replace(/\s+/g, "")}${suffix}${index}`,
        party: "IND",
        registration_line1: voter.address,
        registration_city: "Testville",
        registration_state: "GA",
        registration_zip: "30000",
        latitude: voter.latitude,
        longitude: voter.longitude,
      },
    )
    if (!voterResp.ok()) {
      throw new Error(
        `Mapped fixture voter create failed: ${voterResp.status()} ${await voterResp.text()}`,
      )
    }
    createdVoters.push({ id: (await voterResp.json()).id as string, address: voter.address })
  }

  const turfResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/turfs`,
    {
      name: `${labelPrefix} Turf ${suffix}`,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [baseLongitude - 0.01, baseLatitude - 0.01],
            [baseLongitude + 0.02, baseLatitude - 0.01],
            [baseLongitude + 0.02, baseLatitude + 0.02],
            [baseLongitude - 0.01, baseLatitude + 0.02],
            [baseLongitude - 0.01, baseLatitude - 0.01],
          ],
        ],
      },
    },
  )
  if (!turfResp.ok()) {
    throw new Error(
      `Mapped fixture turf create failed: ${turfResp.status()} ${await turfResp.text()}`,
    )
  }
  const turfId = (await turfResp.json()).id as string

  const walkListName = `${labelPrefix} Walk List ${suffix}`
  const walkListResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists`,
    {
      turf_id: turfId,
      name: walkListName,
    },
  )
  if (!walkListResp.ok()) {
    throw new Error(
      `Mapped fixture walk list create failed: ${walkListResp.status()} ${await walkListResp.text()}`,
    )
  }
  const walkListId = (await walkListResp.json()).id as string

  const partialVoter = createdVoters.find((voter) => voter.address === "200 Bravo St")
  if (!partialVoter) {
    throw new Error("Mapped fixture partial voter was not created.")
  }

  const partialPatchResp = await apiPatch(
    page,
    `/api/v1/campaigns/${campaignId}/voters/${partialVoter.id}`,
    { longitude: null },
  )
  if (!partialPatchResp.ok()) {
    throw new Error(
      `Mapped fixture voter patch failed: ${partialPatchResp.status()} ${await partialPatchResp.text()}`,
    )
  }

  const assignResp = await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`,
    { user_id: volunteerUserId },
  )
  if (!assignResp.ok() && assignResp.status() !== 409) {
    throw new Error(
      `Mapped fixture canvasser assignment failed: ${assignResp.status()} ${await assignResp.text()}`,
    )
  }

  const entriesResp = await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries/enriched`,
  )
  if (!entriesResp.ok()) {
    throw new Error(
      `Mapped fixture entries check failed: ${entriesResp.status()} ${await entriesResp.text()}`,
    )
  }

  const entries = (await entriesResp.json()) as Array<{
    latitude: number | null
    longitude: number | null
    voter: { registration_line1?: string | null }
  }>
  const orderedAddresses = entries.map((entry) => entry.voter.registration_line1 ?? "")

  if (orderedAddresses.join("|") !== voterConfigs.map((voter) => voter.address).join("|")) {
    throw new Error(`Mapped fixture address order mismatch: ${orderedAddresses.join(", ")}`)
  }

  const partialEntry = entries.find(
    (entry) => entry.voter.registration_line1 === "200 Bravo St",
  )
  if (!partialEntry || partialEntry.latitude !== null || partialEntry.longitude !== null) {
    throw new Error("Mapped fixture partial-coordinate entry did not normalize to null/null.")
  }

  return {
    turfId,
    walkListId,
    walkListName,
    orderedAddresses,
    partiallyMappedAddress: "200 Bravo St",
    volunteerLocation: {
      latitude: baseLatitude + 0.011,
      longitude: baseLongitude + 0.011,
    },
  }
}
