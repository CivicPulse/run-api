interface SkipNavProps {
  targetId?: string
}

export function SkipNav({ targetId = "main-content" }: SkipNavProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  )
}
