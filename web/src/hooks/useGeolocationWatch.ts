import { useEffect, useRef, useCallback } from "react"
import { isValidCoordinatePoint, type CoordinatePoint } from "@/types/canvassing"

/** Minimum movement in meters before reporting a new position. */
const MOVEMENT_THRESHOLD_METERS = 50

/** Haversine distance between two coordinate points, in meters. */
function distanceMeters(a: CoordinatePoint, b: CoordinatePoint): number {
  const toRad = (v: number) => v * (Math.PI / 180)
  const R = 6_371_000
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export type GeolocationWatchStatus =
  | "inactive"
  | "watching"
  | "denied"
  | "unavailable"
  | "error"

interface UseGeolocationWatchOptions {
  /** Whether the watcher should be active. */
  active: boolean
  /** Called when the user has moved beyond the movement threshold. */
  onPosition: (point: CoordinatePoint) => void
  /** Called on geolocation errors. */
  onError?: (status: "denied" | "unavailable") => void
  /** Minimum meters moved before triggering onPosition. Default 50. */
  thresholdMeters?: number
}

/**
 * Continuously watches the device GPS via `watchPosition` and fires
 * `onPosition` only when the user has moved more than `thresholdMeters`
 * from the last reported position.
 *
 * Automatically starts/stops based on the `active` flag and cleans up
 * on unmount.
 */
export function useGeolocationWatch({
  active,
  onPosition,
  onError,
  thresholdMeters = MOVEMENT_THRESHOLD_METERS,
}: UseGeolocationWatchOptions): GeolocationWatchStatus {
  const statusRef = useRef<GeolocationWatchStatus>("inactive")
  const lastReportedRef = useRef<CoordinatePoint | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Keep callbacks fresh without restarting the watcher.
  const onPositionRef = useRef(onPosition)
  onPositionRef.current = onPosition
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    statusRef.current = "inactive"
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      return
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      statusRef.current = "unavailable"
      onErrorRef.current?.("unavailable")
      return
    }

    statusRef.current = "watching"

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: CoordinatePoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }

        if (!isValidCoordinatePoint(point)) return

        const last = lastReportedRef.current
        if (last && distanceMeters(last, point) < thresholdMeters) {
          return
        }

        lastReportedRef.current = point
        onPositionRef.current(point)
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED
        statusRef.current = denied ? "denied" : "unavailable"
        onErrorRef.current?.(denied ? "denied" : "unavailable")
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 10_000,
      },
    )

    return () => {
      stop()
    }
  }, [active, stop, thresholdMeters])

  return statusRef.current
}
