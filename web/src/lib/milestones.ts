import { toast } from "sonner"

const MILESTONES = [25, 50, 75, 100] as const

const MILESTONE_CONFIG: Record<number, { emoji: string; message: string }> = {
  25: { emoji: "\uD83C\uDF89", message: "Great start! 25% done." },
  50: { emoji: "\uD83D\uDD25", message: "Halfway there! Keep it up." },
  75: { emoji: "\uD83D\uDE80", message: "Almost done! 75% complete." },
  100: { emoji: "\uD83C\uDFC6", message: "All done! Amazing work." },
}

export function checkMilestone(completed: number, total: number, sessionKey: string): void {
  if (total === 0) return
  const pct = Math.floor((completed / total) * 100)
  const raw = sessionStorage.getItem(sessionKey)
  const fired: number[] = raw ? (JSON.parse(raw) as number[]) : []

  for (const threshold of MILESTONES) {
    if (pct >= threshold && !fired.includes(threshold)) {
      fired.push(threshold)
      sessionStorage.setItem(sessionKey, JSON.stringify(fired))
      const config = MILESTONE_CONFIG[threshold]
      toast(`${config.emoji} ${config.message}`, { duration: 3000 })
      break // Only fire one at a time
    }
  }
}
