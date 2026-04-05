/**
 * Validates that a redirect path is safe to navigate to — same-origin only.
 *
 * Rejects:
 * - empty / non-string values
 * - protocol-relative URLs (//evil.com)
 * - absolute URLs with any scheme (https://, javascript:, data:)
 * - paths that don't start with "/"
 *
 * Accepts same-origin absolute paths (e.g. "/campaigns/new?x=1").
 */
export function isSafeRedirect(
  path: string | null | undefined,
): path is string {
  if (!path || typeof path !== "string") return false
  if (!path.startsWith("/") || path.startsWith("//")) return false
  try {
    const resolved = new URL(path, window.location.origin)
    return resolved.origin === window.location.origin
  } catch {
    return false
  }
}
