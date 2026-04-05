import { test as setup } from "@playwright/test"
import path from "path"
import { loginViaZitadel } from "./auth-flow"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/viewer.json")

setup("authenticate as viewer", async ({ page }) => {
  await loginViaZitadel(page, "viewer")

  await page.context().addCookies([{ name: "sidebar_state", value: "true", domain: "localhost", path: "/" }])
  await page.context().storageState({ path: authFile })
})
