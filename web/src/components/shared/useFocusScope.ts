import { useCallback, useRef } from "react"

const FOCUSABLE_SELECTOR =
  'input, button, a, textarea, select, [tabindex]:not([tabindex="-1"])'

export function useFocusScope() {
  const scopeRef = useRef<HTMLDivElement>(null)

  const focusFirst = useCallback(() => {
    if (scopeRef.current) {
      const first = scopeRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }
  }, [])

  const focusElement = useCallback((selector: string) => {
    if (scopeRef.current) {
      const el = scopeRef.current.querySelector<HTMLElement>(selector)
      el?.focus()
    }
  }, [])

  return { scopeRef, focusFirst, focusElement }
}
