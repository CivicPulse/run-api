import { useEffect, useRef } from "react"
import { toast } from "sonner"

interface ResumePromptParams {
  walkListId: string | null
  storedWalkListId: string | null
  currentAddressIndex: number
  totalAddresses: number
  lastActiveAt: number
  onResume: () => void
  onStartOver: () => void
}

export function useResumePrompt({
  walkListId,
  storedWalkListId,
  currentAddressIndex,
  totalAddresses,
  lastActiveAt,
  onResume,
  onStartOver,
}: ResumePromptParams) {
  const hasShown = useRef(false)

  useEffect(() => {
    if (hasShown.current) return

    const isInterrupted =
      walkListId !== null &&
      walkListId === storedWalkListId &&
      currentAddressIndex > 0 &&
      lastActiveAt > 0

    if (!isInterrupted) return
    hasShown.current = true

    let countdown = 10
    const baseDescription = `Door ${currentAddressIndex + 1} of ${totalAddresses}`

    const toastId = toast(`Pick up where you left off?`, {
      description: `${baseDescription} - Resuming in ${countdown}s...`,
      action: {
        label: "Resume",
        onClick: () => {
          clearInterval(intervalId)
          onResume()
        },
      },
      cancel: {
        label: "Start Over",
        onClick: () => {
          clearInterval(intervalId)
          onStartOver()
        },
      },
      duration: 10000,
      onAutoClose: () => {
        clearInterval(intervalId)
        onResume()
      },
    })

    const intervalId = setInterval(() => {
      countdown -= 1
      if (countdown > 0) {
        toast(`Pick up where you left off?`, {
          id: toastId,
          description: `${baseDescription} - Resuming in ${countdown}s...`,
          action: {
            label: "Resume",
            onClick: () => {
              clearInterval(intervalId)
              onResume()
            },
          },
          cancel: {
            label: "Start Over",
            onClick: () => {
              clearInterval(intervalId)
              onStartOver()
            },
          },
          duration: countdown * 1000,
          onAutoClose: () => {
            clearInterval(intervalId)
            onResume()
          },
        })
      } else {
        clearInterval(intervalId)
      }
    }, 1000)

    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkListId, storedWalkListId])
}
