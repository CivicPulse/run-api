/**
 * Resolve a CSS custom property to a hex color string usable by non-CSS
 * consumers (Leaflet, canvas, etc.).  Results are cached per variable name
 * and invalidated when the theme class changes (light / dark).
 */

let lastTheme: string | null = null
const cache = new Map<string, string>()

function currentTheme(): string {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * Convert any CSS color value (including oklch) to #rrggbb by rasterising
 * a single pixel on an offscreen canvas and reading back the RGB values.
 * Modern Chrome preserves oklch in fillStyle / getComputedStyle, so we
 * cannot rely on the older fillStyle-normalisation trick.
 */
function toHex(cssColor: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")
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
