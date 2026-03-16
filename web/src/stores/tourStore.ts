import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

type Segment = "welcome" | "canvassing" | "phoneBanking"
type Activity = "canvassing" | "phoneBanking"

interface SegmentCompletions {
  welcome: boolean
  canvassing: boolean
  phoneBanking: boolean
}

interface SessionCounts {
  canvassing: number
  phoneBanking: number
}

interface DismissedState {
  canvassing: boolean
  phoneBanking: boolean
}

interface TourState {
  completions: Record<string, SegmentCompletions>
  sessionCounts: Record<string, SessionCounts>
  dismissedThisSession: Record<string, DismissedState>
  isRunning: boolean

  markComplete: (key: string, segment: Segment) => void
  isSegmentComplete: (key: string, segment: Segment) => boolean
  incrementSession: (key: string, activity: Activity) => void
  getSessionCount: (key: string, activity: Activity) => number
  setRunning: (running: boolean) => void
  dismissQuickStart: (key: string, activity: Activity) => void
  isDismissedThisSession: (key: string, activity: Activity) => boolean
  shouldShowQuickStart: (key: string, activity: Activity) => boolean
}

const defaultCompletions: SegmentCompletions = {
  welcome: false,
  canvassing: false,
  phoneBanking: false,
}

const defaultSessionCounts: SessionCounts = {
  canvassing: 0,
  phoneBanking: 0,
}

const defaultDismissed: DismissedState = {
  canvassing: false,
  phoneBanking: false,
}

export function tourKey(campaignId: string, userId: string): string {
  return `${campaignId}_${userId}`
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      completions: {},
      sessionCounts: {},
      dismissedThisSession: {},
      isRunning: false,

      markComplete: (key, segment) =>
        set((state) => ({
          completions: {
            ...state.completions,
            [key]: {
              ...(state.completions[key] ?? defaultCompletions),
              [segment]: true,
            },
          },
        })),

      isSegmentComplete: (key, segment) => {
        const completions = get().completions[key] ?? defaultCompletions
        return completions[segment]
      },

      incrementSession: (key, activity) =>
        set((state) => {
          const current = state.sessionCounts[key] ?? defaultSessionCounts
          return {
            sessionCounts: {
              ...state.sessionCounts,
              [key]: {
                ...current,
                [activity]: current[activity] + 1,
              },
            },
          }
        }),

      getSessionCount: (key, activity) => {
        const counts = get().sessionCounts[key] ?? defaultSessionCounts
        return counts[activity]
      },

      setRunning: (running) => set({ isRunning: running }),

      dismissQuickStart: (key, activity) =>
        set((state) => ({
          dismissedThisSession: {
            ...state.dismissedThisSession,
            [key]: {
              ...(state.dismissedThisSession[key] ?? defaultDismissed),
              [activity]: true,
            },
          },
        })),

      isDismissedThisSession: (key, activity) => {
        const dismissed = get().dismissedThisSession[key] ?? defaultDismissed
        return dismissed[activity]
      },

      shouldShowQuickStart: (key, activity) => {
        const state = get()
        const counts = state.sessionCounts[key] ?? defaultSessionCounts
        const dismissed = state.dismissedThisSession[key] ?? defaultDismissed
        return counts[activity] < 3 && !dismissed[activity] && !state.isRunning
      },
    }),
    {
      name: "tour-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        completions: state.completions,
        sessionCounts: state.sessionCounts,
      }),
    }
  )
)
