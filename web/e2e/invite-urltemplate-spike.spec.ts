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
 * cookie is set on the `auth.civpulse.org` origin. Assertions about
 * `authStore` hydration and authed backend calls are Phase 114's scope and
 * are deliberately absent here (moving them to Phase 111 would force this
 * phase to ship Phase 114's code).
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

test.describe("Phase 111 urlTemplate deep-link spike", () => {
  // Spec-local trace/video/screenshot retention, overrides weaker playwright.config.ts
  // defaults. Added in T4 for this spike only — on failure we need the trace to
  // diagnose whether ZITADEL's urlTemplate substitution broke vs our expectations.
  // (Placeholder until T4 — intentionally not set yet.)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  test.skip("placeholder — real test lands in T3", async () => {
    // The real test body arrives in task T3. Keeping this skipped placeholder
    // so the file is valid TypeScript after T1's commit. It is replaced in T3.
    const _t = await getZitadelToken()
    void _t
    void spikeState
  })
})
