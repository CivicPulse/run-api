/**
 * Resolve a CSS custom property to a hex color string usable by non-CSS
 * consumers (Leaflet, canvas, etc.).  Results are cached per variable name
 * and invalidated when the theme class changes (light ↔ dark).
 */

let lastTheme: string | null = null
const cache = new Map<string, string>()

function currentTheme(): string {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/** Convert any CSS color value to #rrggbb using an offscreen canvas. */
function toHex(cssColor: string): string {
  const ctx = document.createElement("canvas").getContext("2d")!
  ctx.fillStyle = cssColor
  return ctx.fillStyle // browsers normalise to #rrggbb
}

/**
 * Read a CSS custom property from :root and return a hex color.
 * Cached per theme; call from render or effects — never in a tight loop.
 */
export function resolveCssColor(varName: string): string {
  const theme = currentTheme()
  if (theme !== lastTheme) {
    cache.clear()
    lastTheme = theme
  }

  const cached = cache.get(varName)
  if (cached) return cached

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  const hex = raw ? toHex(raw) : "#888888"
  cache.set(varName, hex)
  return hex
}
