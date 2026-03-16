import { useEffect, useRef, useCallback } from "react"
import { driver, type DriveStep } from "driver.js"
import "@/styles/tour.css"
import { useTourStore } from "@/stores/tourStore"
import { toast } from "sonner"

type Segment = "welcome" | "canvassing" | "phoneBanking"

export function useTour(tourKey: string) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  const startSegment = useCallback(
    (segment: Segment, steps: DriveStep[]) => {
      // Clean up any existing tour
      driverRef.current?.destroy()

      const { setRunning, markComplete } = useTourStore.getState()
      setRunning(true)

      const driverObj = driver({
        showProgress: true,
        progressText: "Step {{current}} of {{total}}",
        nextBtnText: "Next",
        doneBtnText: "Done",
        showButtons: ["next", "close"],
        allowClose: true,
        overlayColor: "black",
        overlayOpacity: 0.5,
        stagePadding: 10,
        stageRadius: 8,
        popoverOffset: 12,
        animate: true,
        steps,
        onDestroyed: () => {
          markComplete(tourKey, segment)
          setRunning(false)
          driverRef.current = null
          toast("Tour complete! Tap the help button anytime to replay.")
        },
      })

      driverRef.current = driverObj
      driverObj.drive()
    },
    [tourKey],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        // Destroy without triggering onDestroyed completion logic
        // by marking as already cleaned up
        const ref = driverRef.current
        driverRef.current = null
        const { setRunning } = useTourStore.getState()
        setRunning(false)
        ref.destroy()
      }
    }
  }, [])

  return { startSegment }
}
