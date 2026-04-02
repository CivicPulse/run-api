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
  // First, ensure we're authenticated by navigating to the app
  await page.goto("/")
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") &&
      !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  await page.waitForLoadState("domcontentloaded")

  // Try to find the campaign ID via API (retries for parallel resilience).
  // Use /me/campaigns (flat list of user's memberships) instead of /campaigns
  // (paginated, newest first) to avoid E2E test campaigns pushing seed off page 1.
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
      // Rate-limited or transient error — back off before retrying
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    } catch {
      // Retry after a short delay on failure
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    }
  }

  // Fallback: try to find the campaign link on the page
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb/i })
    .first()
  await campaignLink.waitFor({ state: "visible", timeout: 30_000 })
  const href = await campaignLink.getAttribute("href")
  const match = href?.match(/campaigns\/([a-f0-9-]+)/)
  if (!match) throw new Error("Could not find seed campaign ID from card link")
  return match[1]
}

/**
 * Extract the OIDC access token from localStorage.
 * The frontend stores auth via oidc-client-ts in a key like
 * `oidc.user:{authority}:{client_id}`.
 */
export async function getAuthToken(page: Page): Promise<string> {
  // page.evaluate() throws SecurityError when the page is on about:blank or a
  // cross-origin document (e.g. when tests call API helpers before navigating).
  // Fall through to the storageState() path in that case.
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
          } catch { /* skip */ }
        }
      }
      return ""
    })
  } catch {
    // SecurityError: localStorage inaccessible (about:blank or cross-origin).
    // The storageState() fallback below will supply the token.
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
          // Not JSON auth data, continue searching
        }
      }
    }
  }

  throw new Error("No OIDC access token found in localStorage or storageState")
}

/**
 * Get Authorization headers for page.request calls.
 * Usage: `page.request.get(url, { headers: await authHeaders(page) })`
 */
export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await getAuthToken(page)
  return { Authorization: `Bearer ${token}` }
}

/**
 * Authenticated GET request via page.request.
 */
export async function apiGet(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.get(url, { headers: await authHeaders(page), timeout })
}

/**
 * Authenticated POST request via page.request.
 */
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

/**
 * Authenticated PATCH request via page.request.
 */
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

/**
 * Authenticated DELETE request via page.request.
 */
export async function apiDelete(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.delete(url, {
    headers: await authHeaders(page),
    timeout,
  })
}

/**
 * Authenticated POST with exponential-backoff retry for transient 5xx errors.
 *
 * Under high parallelism (16+ workers), PostgreSQL pool exhaustion can cause
 * intermittent 500 "too many clients" responses. This wrapper retries up to
 * `maxRetries` times with increasing delays, returning on the first success or
 * any non-5xx response.
 */
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
  // Final attempt — return regardless of status so the caller can assert
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

  // Reset backend assignment ownership for deterministic FIELD-07 selection.
  // Remove this volunteer from all existing walk lists before assigning the
  // disposable fixture walk list.
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
      description: "Deterministic FIELD-07 inline survey fixture",
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

  const turfResp = await apiPostWithRetry(
    page,
    `/api/v1/campaigns/${campaignId}/turfs`,
    {
      name: `${labelPrefix} Turf ${suffix}`,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [-83.66, 32.86],
            [-83.62, 32.86],
            [-83.62, 32.83],
            [-83.66, 32.83],
            [-83.66, 32.86],
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
  const entries = (await entriesResp.json()) as unknown[]
  const entryCount = entries.length
  if (entryCount < 1) {
    throw new Error(
      `Fixture walk list has no entries: ${walkListId}. Adjust turf boundary for seeded voters.`,
    )
  }

  return {
    turfId,
    walkListId,
    walkListName,
    scriptId,
    scriptTitle,
    entryCount,
  }
}
