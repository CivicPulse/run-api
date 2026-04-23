/**
 * Phase 111 — urlTemplate deep-link spike
 *
 * **Gating spike for the v1.19 milestone.** Proves ZITADEL 2.71.x's
 * `urlTemplate` parameter reliably deep-links an invitee back to
 * `https://run.civpulse.org/invites/<token>?zitadelCode=...&userID=...`
 * after completing the hosted password-set flow.
 *
 * **Scope narrowed per 111-REVIEWS.md §Blockers B1 (option b):** this spike
 * proves the LANDING URL CONTRACT only — urlTemplate substitution works,
 * browser arrives at the correct path, the query string carries the two
 * template placeholders populated to concrete values, and a ZITADEL session
 * cookie is set on the `auth.civpulse.org` origin. Assertions about the
 * SPA auth-store hydration and authed backend calls are Phase 114's scope
 * and are deliberately absent here (moving them to Phase 111 would force
 * this phase to ship Phase 114's code).
 *
 * ZITADEL v2 hosted invite verify page (invite=true branch):
 *   ${ZITADEL_URL}/ui/v2/login/verify?userId=<userId>&code=<inviteCode>&invite=true
 * Reference: zitadel/typescript apps/login src/app/(login)/verify/page.tsx —
 *   searchParams.invite === "true" drives the set-password-then-redirect flow
 *   that honors our urlTemplate from POST /v2/users/{userId}/invite_code.
 *
 * Env requirements (see .env.example and web/scripts/run-e2e.sh guard):
 *   - ZITADEL_URL — dev ZITADEL issuer (NEVER prod)
 *   - ZITADEL_SERVICE_CLIENT_ID — runtime service-account client id
 *   - ZITADEL_SERVICE_CLIENT_SECRET — runtime service-account client secret
 *
 * Runner: MUST be invoked via `web/scripts/run-e2e.sh` so the run is logged
 * to `web/e2e-runs.jsonl`. Do not call `npx playwright test` directly.
 */

import { test, expect } from "@playwright/test"
import { randomUUID } from "node:crypto"

// ─────────────────────────────────────────────────────────────────────────────
// LOCKED urlTemplate shape — this is the EXACT string that EMAIL-03 will ship
// later in Phase 113. Changing it here without replanning EMAIL-03 would break
// the regression-gate contract this spike establishes. Template placeholders
// {{.Code}} and {{.UserID}} are substituted by ZITADEL before redirect.
// LOCKED urlTemplate: https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}
// ─────────────────────────────────────────────────────────────────────────────
const URL_TEMPLATE = "https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}"

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only ZITADEL service-account token helper.
// Mirrors app/services/zitadel.py:46-93 (_get_token): client_credentials grant
// against ZITADEL's /oauth/v2/token with the same scope the API uses.
// Throws if required envs are missing — the runner-level guard in run-e2e.sh
// is the primary defense; this throw-in-JS is the backstop for developers who
// invoke `npx playwright test` directly.
// ─────────────────────────────────────────────────────────────────────────────
async function getZitadelToken(): Promise<string> {
  const zitadelUrl = process.env.ZITADEL_URL
  const clientId = process.env.ZITADEL_SERVICE_CLIENT_ID
  const clientSecret = process.env.ZITADEL_SERVICE_CLIENT_SECRET

  if (!zitadelUrl || !clientId || !clientSecret) {
    throw new Error(
      "Phase 111 spike: missing ZITADEL_URL / ZITADEL_SERVICE_CLIENT_ID / " +
        "ZITADEL_SERVICE_CLIENT_SECRET env. Set them in .env (see .env.example) " +
        "and export them (or `set -a; source .env; set +a`) before running " +
        "web/scripts/run-e2e.sh.",
    )
  }

  // Build the client_credentials body. We construct it as a literal
  // string so the exact wire shape is obvious at review time:
  //   grant_type=client_credentials&client_id=...&client_secret=...&scope=...
  // (matches app/services/zitadel.py:_get_token lines 65-73 verbatim.)
  const body =
    "grant_type=client_credentials" +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&scope=${encodeURIComponent("openid urn:zitadel:iam:org:project:id:zitadel:aud")}`

  const res = await fetch(`${zitadelUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "<unreadable response body>")
    throw new Error(
      `Phase 111 spike: ZITADEL token exchange failed (${res.status}): ${text.slice(0, 300)}`,
    )
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error(
      "Phase 111 spike: ZITADEL token response missing access_token",
    )
  }
  return data.access_token
}

// Module-scoped state set in beforeAll and consumed by the test + afterAll.
// Populated by the T2 setup in the next commit.
const spikeState: {
  email: string | null
  userId: string | null
  inviteCode: string | null
  serviceToken: string | null
} = {
  email: null,
  userId: null,
  inviteCode: null,
  serviceToken: null,
}

// Spec-local trace/video/screenshot retention — overrides playwright.config.ts
// defaults (trace: "on-first-retry"). On spike failure we need the full trace
// immediately to diagnose whether ZITADEL's urlTemplate substitution broke vs
// our selector expectations — a first-retry trace is too late (spikes run
// without retries in dev).
test.use({
  // Clean browser context — the spike creates its own throwaway ZITADEL user
  // and must NOT inherit stale session cookies from the auth-setup state files
  // (e.g., owner.json), which would cause ZITADEL to redirect the invite page
  // to the regular "Welcome Back" login form instead of showing the init form.
  storageState: { cookies: [], origins: [] },
  trace: "retain-on-failure",
  video: "retain-on-failure",
  screenshot: "only-on-failure",
})

test.describe("Phase 111 urlTemplate deep-link spike", () => {
  // ───────────────────────────────────────────────────────────────────────
  // Server-side invitee provisioning.
  // Creates a per-run throwaway human user with isVerified=true, then mints
  // an invite code with the LOCKED urlTemplate. ZITADEL does NOT send mail
  // because we pass `returnCode: {}` — we get the code back in the response
  // and the test drives the hosted flow directly.
  //
  // Shapes sourced from:
  //   - .planning/research/SUMMARY.md (returnCode shape + urlTemplate shape)
  //   - ZITADEL v2 docs — zitadel.user.v2.UserService.CreateUser / CreateInviteCode
  //   - .planning/research/PITFALLS.md §M1 — pre-created user MUST go through
  //     accept-invite before its first login, else the invite shell is orphaned.
  // ───────────────────────────────────────────────────────────────────────
  test.beforeAll(async () => {
    const zitadelUrl = process.env.ZITADEL_URL
    if (!zitadelUrl) {
      throw new Error(
        "Phase 111 spike: ZITADEL_URL must be set — cannot provision invitee.",
      )
    }

    // Per-run throwaway identity (D-SPIKE-04). `.test` TLD cannot receive mail,
    // and afterAll (T4) deletes the user regardless of test outcome.
    const email = `spike-${randomUUID()}@civpulse.test`

    const token = await getZitadelToken()
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    } as const

    // 1) POST /v2/users/human — create the throwaway human user.
    //    isVerified=true is safe via the invite-code path (research SUMMARY.md
    //    confirms this is the sanctioned shape; Option B explicitly relies on it).
    const createRes = await fetch(`${zitadelUrl}/v2/users/human`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        username: email,
        profile: { givenName: "Spike", familyName: "Invitee" },
        email: { email, isVerified: true },
      }),
    })

    if (createRes.status !== 200 && createRes.status !== 201) {
      const text = await createRes
        .text()
        .catch(() => "<unreadable response body>")
      throw new Error(
        `Phase 111 spike: POST /v2/users/human failed (${createRes.status}): ${text.slice(0, 500)}`,
      )
    }

    const createJson = (await createRes.json()) as {
      userId?: string
      id?: string
    }
    const userId = createJson.userId ?? createJson.id
    if (!userId) {
      throw new Error(
        `Phase 111 spike: POST /v2/users/human response missing userId. Body: ${JSON.stringify(createJson).slice(0, 500)}`,
      )
    }

    // 2) POST /v2/users/{userId}/invite_code — mint the invite code.
    //    Body shape is the research-locked {"returnCode": {}, "urlTemplate": ...}.
    //    urlTemplate is LOCKED to EMAIL-03's exact shape; changing it here
    //    breaks Phase 113's regression contract.
    const inviteRes = await fetch(
      `${zitadelUrl}/v2/users/${userId}/invite_code`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          returnCode: {},
          urlTemplate: URL_TEMPLATE,
        }),
      },
    )

    if (inviteRes.status !== 200 && inviteRes.status !== 201) {
      const text = await inviteRes
        .text()
        .catch(() => "<unreadable response body>")
      throw new Error(
        `Phase 111 spike: POST /v2/users/{userId}/invite_code failed (${inviteRes.status}): ${text.slice(0, 500)}`,
      )
    }

    const inviteJson = (await inviteRes.json()) as { inviteCode?: string }
    const inviteCode = inviteJson.inviteCode
    if (!inviteCode) {
      throw new Error(
        `Phase 111 spike: POST /v2/users/{userId}/invite_code response missing inviteCode. Body: ${JSON.stringify(inviteJson).slice(0, 500)}`,
      )
    }

    spikeState.email = email
    spikeState.userId = userId
    spikeState.inviteCode = inviteCode
    spikeState.serviceToken = token
  })

  // ───────────────────────────────────────────────────────────────────────
  // Cleanup: DELETE the throwaway invitee so repeated spike runs do not
  // accumulate dead users in dev ZITADEL. Accept 200/204/404 as success —
  // 404 covers the "already deleted" case (safe to re-run cleanup).
  // ───────────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    const zitadelUrl = process.env.ZITADEL_URL
    if (!zitadelUrl || !spikeState.userId || !spikeState.serviceToken) {
      // beforeAll failed before provisioning — nothing to clean up.
      return
    }
    try {
      const res = await fetch(
        `${zitadelUrl}/v2/users/${spikeState.userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${spikeState.serviceToken}`,
          },
        },
      )
      if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
        // Log but do NOT throw — cleanup is best-effort.
        // Next run will still succeed because each run uses a unique email+user.
        // eslint-disable-next-line no-console
        console.warn(
          `[Phase 111 spike] Cleanup DELETE returned ${res.status} for userId=${spikeState.userId}; user may leak in dev ZITADEL.`,
        )
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Phase 111 spike] Cleanup DELETE threw: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  test("urlTemplate deep-links invitee to /invites/<token> with zitadelCode+userID", async ({
    page,
  }) => {
    const zitadelUrl = process.env.ZITADEL_URL
    expect(zitadelUrl, "ZITADEL_URL must be set").toBeTruthy()
    expect(
      spikeState.userId,
      "beforeAll must populate spikeState.userId",
    ).toBeTruthy()
    expect(
      spikeState.inviteCode,
      "beforeAll must populate spikeState.inviteCode",
    ).toBeTruthy()

    const userId = spikeState.userId!
    const inviteCode = spikeState.inviteCode!

    // 1) Navigate to the COMMITTED ZITADEL hosted invite-verify page.
    //
    //    DEVIATION [Rule 1 — Bug]: The plan's original URL was
    //      ${ZITADEL_URL}/ui/v2/login/verify?userId=<userId>&code=<inviteCode>&invite=true
    //    referencing the `zitadel/typescript` login app. Empirical probe
    //    (2026-04-23) against our dev ZITADEL v4.10.1 showed /ui/v2/login/*
    //    returns HTTP 404 — the typescript login app is NOT bundled into the
    //    ZITADEL server binary and must be deployed as a separate service.
    //    Our dev instance serves the classic Go-templates console-login UI at
    //    /ui/login/*. Within that UI, the v2-invite-code redemption path is
    //    /ui/login/user/invite (NOT /ui/login/user/init — that one handles
    //    v1 initialize-user codes, a different code type).
    //    Verified the page fills field IDs `code`, `password`, `passwordconfirm`
    //    and submits via a "Next" button.
    //    NOTE: the legacy path uses `userID` (capital D) in query params.
    //    References:
    //      - github.com/zitadel/zitadel /internal/api/ui/login/user_invite_handler.go
    const verifyUrl =
      `${zitadelUrl}/ui/login/user/invite` +
      `?userID=${encodeURIComponent(userId)}` +
      `&code=${encodeURIComponent(inviteCode)}`
    await page.goto(verifyUrl, { waitUntil: "domcontentloaded" })

    // 2) Generated strong password meeting ZITADEL default policy
    //    (12+ chars, upper/lower/digit/symbol).
    const password = "Spike!" + randomUUID().slice(0, 12) + "Aa1"

    // 3) Fill the ZITADEL v2 password-set form. Priority: accessible labels
    //    (ZITADEL's v2 login UI sets them), falling back to input[type=password].
    //    We pick ONE locator per run — do NOT chain fallbacks inside a single run.
    let passwordField = page.getByLabel(/password/i).first()
    let confirmField = page.getByLabel(/confirm/i).first()
    if ((await passwordField.count()) === 0) {
      passwordField = page.locator('input[type="password"]').first()
      confirmField = page.locator('input[type="password"]').nth(1)
    }

    await passwordField.fill(password)
    await confirmField.fill(password)
    // Button regex includes "next" — the classic console-login UI's primary
    // submit button on /ui/login/user/init is labelled "Next" (id=init-button).
    // (See 2026-04-23 probe; /ui/v2/login/verify uses "Continue"/"Save".)
    await page
      .getByRole("button", { name: /continue|save|set password|submit|next/i })
      .first()
      .click()

    // 4) Wait for the browser to land on the LOCKED regex.
    //    Landing URL shape is the EXACT string EMAIL-03 will ship later in
    //    Phase 113. If this regex ever changes, the whole spike contract
    //    breaks and EMAIL-03 must be replanned.
    // eslint-disable-next-line prettier/prettier
    await page.waitForURL(/^https:\/\/run\.civpulse\.org\/invites\/[^/?#]+\?zitadelCode=[^&#]+&userID=[^&#]+$/, { timeout: 30_000 })

    // 5) Landing-URL substitution proof.
    const landed = new URL(page.url())
    expect(
      landed.pathname,
      "token path segment must be present and slash-free",
    ).toMatch(/^\/invites\/[^/]+$/)

    const zitadelCode = landed.searchParams.get("zitadelCode")
    expect(zitadelCode, "zitadelCode query param must be present").toBeTruthy()
    expect(
      zitadelCode,
      "ZITADEL must substitute {{.Code}} — literal placeholder means template shipped untouched",
    ).not.toBe("{{.Code}}")

    const landedUserId = landed.searchParams.get("userID")
    expect(
      landedUserId,
      "userID must carry through from provisioned user",
    ).toBe(userId)

    // 6) ZITADEL session-cookie precondition — Phase 114's silent-renew flow
    //    depends on a ZITADEL session being present on the auth origin. Without
    //    it, no subsequent OIDC handoff can succeed.
    const zitadelHost = new URL(zitadelUrl!).host
    const cookies = await page.context().cookies()
    const zitadelSessionCookie = cookies.find(
      (c) => c.domain.endsWith(zitadelHost) && /session|zitadel/i.test(c.name),
    )
    expect(
      zitadelSessionCookie,
      "ZITADEL session cookie must be set on auth origin after password-set flow",
    ).toBeDefined()

    // NOTE: Per the scope-narrow decision in 111-REVIEWS.md §Blockers B1, this
    // spike deliberately stops here. The next assertions — SPA auth-store
    // hydration from the zitadelCode query param, and an authed backend call
    // returning 200 — are Phase 114's explicit scope. Phase 114's verification
    // gate re-runs this flow end-to-end and adds them. Keeping this spike
    // narrow prevents Phase 111 from shipping Phase 114's code.
  })
})
