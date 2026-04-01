import { useEffect, useRef, type ReactNode } from "react"

const FOCUSABLE_SELECTOR =
  'input, button, a, textarea, select, [tabindex]:not([tabindex="-1"])'

interface FocusScopeProps {
  children: ReactNode
  autoFocus?: boolean
  restoreFocus?: boolean
  className?: string
}

export function FocusScope({
  children,
  autoFocus = false,
  restoreFocus = true,
  className,
}: FocusScopeProps) {
  const scopeRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement

    if (autoFocus && scopeRef.current) {
      const first = scopeRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }

    return () => {
      if (restoreFocus && previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [autoFocus, restoreFocus])

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  )
}
