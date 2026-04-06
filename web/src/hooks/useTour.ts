import { useEffect, useRef, useCallback } from "react"
import type { DriveStep } from "driver.js"
import { useTourStore } from "@/stores/tourStore"
import type { driver as createDriver } from "driver.js"

type Segment = "welcome" | "canvassing" | "phoneBanking"

let cachedDriverFactory: typeof createDriver | null = null
let cachedToast:
  | ((message: string, options?: { [key: string]: unknown }) => void)
  | null = null

async function ensureTourDeps() {
  if (!cachedDriverFactory || !cachedToast) {
    const [{ driver }, { toast }] = await Promise.all([
      import("driver.js"),
      import("sonner"),
      import("@/styles/tour.css"),
    ])
    cachedDriverFactory = driver
    cachedToast = toast
  }

  return {
    driver: cachedDriverFactory,
    toast: cachedToast,
  }
}

export function shouldAutoStartTour() {
  if (typeof window === "undefined") return false
  return !window.navigator.webdriver && document.visibilityState === "visible"
}

export function useTour(tourKey: string) {
  const driverRef = useRef<ReturnType<typeof createDriver> | null>(null)

  const startSegment = useCallback(
    async (segment: Segment, steps: DriveStep[]) => {
      // Clean up any existing tour
      driverRef.current?.destroy()

      const { setRunning, markComplete } = useTourStore.getState()
      setRunning(true)

      const { driver, toast } = await ensureTourDeps()

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
          toast?.("Tour complete! Tap the help button anytime to replay.")
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
