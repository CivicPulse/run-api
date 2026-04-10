import { useState, useEffect, useRef, useCallback } from "react"
import { Device, Call } from "@twilio/voice-sdk"
import { api } from "@/api/client"
import type { TwilioCallStatus, VoiceTokenResponse } from "@/types/voice"

interface UseTwilioDeviceReturn {
  callStatus: TwilioCallStatus
  isMuted: boolean
  duration: number
  error: string | null
  connect: (toNumber: string, campaignId: string) => Promise<void>
  disconnect: () => void
  toggleMute: () => void
  isReady: boolean
}

async function fetchToken(campaignId: string): Promise<string> {
  const resp = await api
    .post(`api/v1/campaigns/${campaignId}/voice/token`)
    .json<VoiceTokenResponse>()
  return resp.token
}

export function useTwilioDevice(
  campaignId: string,
  enabled: boolean,
): UseTwilioDeviceReturn {
  const [callStatus, setCallStatus] = useState<TwilioCallStatus>("idle")
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<Call | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const campaignIdRef = useRef(campaignId)
  useEffect(() => {
    campaignIdRef.current = campaignId
  }, [campaignId])

  // Clear the duration timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Initialize device when enabled
  useEffect(() => {
    if (!enabled || !campaignId) return

    let cancelled = false

    async function init() {
      try {
        const token = await fetchToken(campaignId)
        if (cancelled) return

        const device = new Device(token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          closeProtection:
            "A call is in progress. Leaving will end it.",
        })

        device.on("tokenWillExpire", async () => {
          try {
            const newToken = await fetchToken(campaignIdRef.current)
            device.updateToken(newToken)
          } catch {
            // Token refresh failed; call will eventually disconnect
          }
        })

        device.on("error", (deviceError) => {
          setCallStatus("error")
          setError(
            deviceError?.message ?? "An unknown error occurred",
          )
        })

        device.on("registered", () => {
          if (!cancelled) setIsReady(true)
        })

        device.on("unregistered", () => {
          if (!cancelled) setIsReady(false)
        })

        await device.register()
        deviceRef.current = device
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to initialize voice device",
          )
        }
      }
    }

    init()

    return () => {
      cancelled = true
      clearTimer()
      if (deviceRef.current) {
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      setIsReady(false)
      setCallStatus("idle")
    }
  }, [enabled, campaignId, clearTimer])

  const connect = useCallback(
    async (toNumber: string, cId: string) => {
      if (!deviceRef.current) return

      setCallStatus("connecting")
      setDuration(0)
      setIsMuted(false)
      setError(null)

      try {
        const call = await deviceRef.current.connect({
          params: { To: toNumber, CampaignId: cId },
        })

        callRef.current = call

        call.on("ringing", () => setCallStatus("ringing"))

        call.on("accept", () => {
          setCallStatus("open")
          // Start duration timer
          timerRef.current = setInterval(() => {
            setDuration((d) => d + 1)
          }, 1000)
        })

        call.on("disconnect", () => {
          setCallStatus("closed")
          clearTimer()
          callRef.current = null
        })

        call.on("cancel", () => {
          setCallStatus("closed")
          clearTimer()
          callRef.current = null
        })

        call.on("error", (callError) => {
          setCallStatus("error")
          setError(
            callError?.message ?? "Call error occurred",
          )
          clearTimer()
          callRef.current = null
        })

        call.on("mute", (_isMuted: boolean, activeCall: Call) => {
          setIsMuted(activeCall.isMuted())
        })
      } catch (err) {
        setCallStatus("error")
        setError(
          err instanceof Error ? err.message : "Failed to connect call",
        )
      }
    },
    [clearTimer],
  )

  const disconnect = useCallback(() => {
    callRef.current?.disconnect()
  }, [])

  const toggleMute = useCallback(() => {
    if (callRef.current) {
      callRef.current.mute(!isMuted)
    }
  }, [isMuted])

  return {
    callStatus,
    isMuted,
    duration,
    error,
    connect,
    disconnect,
    toggleMute,
    isReady,
  }
}
