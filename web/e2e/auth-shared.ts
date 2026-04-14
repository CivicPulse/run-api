import type { Page } from "@playwright/test";

function matchesZitadelLogin(url: URL): boolean {
  const expectedHost = process.env.E2E_ZITADEL_HOST;
  const expectedPort = process.env.E2E_ZITADEL_PORT;

  // When both host and port are configured, require BOTH to match. Otherwise
  // a shared hostname (e.g. localhost in CI where app and Zitadel differ only
  // by port) flags every app URL as Zitadel and breaks waitForPostLoginApp.
  if (expectedHost && expectedPort) {
    if (url.hostname === expectedHost && url.port === expectedPort) return true;
  } else if (expectedHost && url.hostname === expectedHost) {
    return true;
  } else if (expectedPort && url.port === expectedPort) {
    return true;
  }

  return (
    url.pathname.includes("/ui/login") ||
    url.pathname.includes("/loginname") ||
    url.pathname.includes("/login")
  );
}

export async function waitForZitadelLogin(page: Page): Promise<void> {
  await page.waitForURL((url) => matchesZitadelLogin(url), { timeout: 30_000 });
}

export async function waitForPostLoginApp(page: Page): Promise<void> {
  await page.waitForURL(
    (url) =>
      !matchesZitadelLogin(url) &&
      !url.pathname.includes("/callback") &&
      !url.pathname.endsWith("/login"),
    { timeout: 30_000 },
  );
}
