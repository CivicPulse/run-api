import { test as setup } from "@playwright/test"
import path from "path"
import { loginViaZitadel } from "./auth-flow"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/volunteer.json")

setup("authenticate as volunteer", async ({ page }) => {
  await loginViaZitadel(page, "volunteer")

  await page.context().addCookies([{ name: "sidebar_state", value: "true", domain: "localhost", path: "/" }])
  await page.context().storageState({ path: authFile })
})
