import { createFileRoute, Link, Navigate, useParams } from "@tanstack/react-router"
import { AlertTriangle, Loader2, Wallet } from "lucide-react"
import { formatPhoneDisplay } from "@/types/calling"
import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  usePhoneBankSession,
  useClaimEntry,
  useRecordCall,
  useSelfReleaseEntry,
} from "@/hooks/usePhoneBankSessions"
import { useCallList } from "@/hooks/useCallLists"
import { useCallerCheckInStatus } from "@/hooks/useCallerCheckInStatus"
import { OUTCOME_GROUPS } from "@/types/phone-bank-session"
import { buildRecordCallPayload, type RecordCallPayload } from "@/types/phone-bank-session"
import type { CallListEntry } from "@/types/call-list"
import type { DNCCheckResult, CallingHoursCheck } from "@/types/voice"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PhoneNumberList } from "@/components/field/PhoneNumberList"
import { useVoiceCapability } from "@/hooks/useVoiceCapability"
import { useTwilioDevice } from "@/hooks/useTwilioDevice"
import { api } from "@/api/client"

export const Route = createFileRoute(
  "/campaigns/$campaignId/phone-banking/sessions/$sessionId/call",
)({ component: ActiveCallingPage })

// --- State machine ---

type CallingState =
  | { phase: "idle" }
  | { phase: "claiming" }
  | { phase: "claimed"; entry: CallListEntry; startedAt: string; selectedPhone: string }
  | { phase: "recording"; entry: CallListEntry; startedAt: string; selectedPhone: string }
  | { phase: "recorded"; entry: CallListEntry; resultCode: string }
  | { phase: "complete" }

// --- Survey question types ---

interface SurveyQuestion {
  id: string
  text: string
  question_type: string
  options?: string[]
  order: number
}

// --- VoterInfoPanel ---

function VoterInfoPanel({
  entry,
  selectedPhone,
  onPhoneSelect,
  campaignId,
  twilioDevice,
  callMode,
  activeCallNumber,
  dncStatus,
  callingHoursCheck,
  onBrowserCall,
  onCallStarted,
}: {
  entry: CallListEntry
  selectedPhone: string
  onPhoneSelect: (phone: string) => void
  campaignId: string
  twilioDevice: ReturnType<typeof useTwilioDevice>
  callMode: "browser" | "tel"
  activeCallNumber: string | null
  dncStatus: Record<string, DNCCheckResult>
  callingHoursCheck: CallingHoursCheck | null
  onBrowserCall: (e164: string) => void
  onCallStarted: (e164: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Voter
        </h3>
        <p className="text-lg font-semibold">{entry.voter_name ?? "Unknown Voter"}</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Phone Numbers
        </h3>
        {entry.phone_numbers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No phone numbers on file.</p>
        ) : (
          <PhoneNumberList
            phones={entry.phone_numbers}
            attempts={entry.phone_attempts}
            voterName={entry.voter_name ?? "Unknown Voter"}
            onCallStarted={(e164) => {
              onPhoneSelect(e164)
              onCallStarted(e164)
            }}
            callMode={callMode}
            callStatus={twilioDevice.callStatus}
            activeCallNumber={activeCallNumber}
            isMuted={twilioDevice.isMuted}
            duration={twilioDevice.duration}
            onBrowserCall={(e164) => {
              onPhoneSelect(e164)
              onBrowserCall(e164)
            }}
            onHangUp={twilioDevice.disconnect}
            onToggleMute={twilioDevice.toggleMute}
            dncStatus={dncStatus}
            callingHoursCheck={callingHoursCheck}
          />
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Info
        </h3>
        <p className="text-xs text-muted-foreground">Attempt #{entry.attempt_count + 1}</p>
      </div>
    </div>
  )
}

// --- SurveyPanel ---

function SurveyPanel({
  campaignId,
  scriptId,
  surveyResponses,
  notes,
  onResponseChange,
  onNotesChange,
}: {
  campaignId: string
  scriptId: string | null | undefined
  surveyResponses: Record<string, string>
  notes: string
  onResponseChange: (questionId: string, value: string) => void
  onNotesChange: (notes: string) => void
}) {
  // TODO: Replace inline useQuery with a dedicated useScript(campaignId, scriptId) hook
  // when the hook is implemented. This hook would live in usePhoneBankSessions.ts or
  // a new useScripts.ts file and fetch GET /surveys/{scriptId}/questions.
  const { data: surveyQuestions } = useQuery({
    queryKey: ["campaigns", campaignId, "scripts", scriptId, "questions"],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions`)
        .json<SurveyQuestion[]>(),
    enabled: !!scriptId,
  })

  return (
    <div className="space-y-4">
      {scriptId && surveyQuestions && surveyQuestions.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Survey Questions
          </h3>
          {surveyQuestions.map((q) => (
            <div key={q.id} className="space-y-2">
              <Label className="text-sm">{q.text}</Label>
              {q.question_type === "select" && q.options ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <Button
                      key={opt}
                      variant={surveyResponses[q.id] === opt ? "default" : "outline"}
                      size="sm"
                      onClick={() => onResponseChange(q.id, opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              ) : (
                <Textarea
                  value={surveyResponses[q.id] ?? ""}
                  onChange={(e) => onResponseChange(q.id, e.target.value)}
                  className="min-h-[60px]"
                  placeholder="Enter response..."
                />
              )}
            </div>
          ))}
        </div>
      ) : scriptId ? (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Survey Questions
          </h3>
          <p className="text-sm text-muted-foreground">Loading survey questions...</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="call-notes" className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Notes
        </Label>
        <Textarea
          id="call-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="min-h-[80px]"
          placeholder="Optional notes about this call..."
        />
      </div>
    </div>
  )
}

// --- OutcomePanel ---

function OutcomePanel({
  onOutcome,
  onSkip,
  isPending,
}: {
  onOutcome: (resultCode: string) => void
  onSkip: () => void
  isPending: boolean
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Outcome
      </h3>
      {OUTCOME_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.outcomes.map((outcome) => (
              <Button
                key={outcome.code}
                variant={
                  group.label === "Connected"
                    ? "default"
                    : group.label === "Terminal"
                      ? "destructive"
                      : "outline"
                }
                size="sm"
                disabled={isPending}
                onClick={() => onOutcome(outcome.code)}
              >
                {outcome.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onSkip}
        >
          Skip (release without recording)
        </Button>
      </div>
    </div>
  )
}

// --- ActiveCallingPage ---

function ActiveCallingPage() {
  const { campaignId, sessionId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/sessions/$sessionId/call",
  })

  // Server-side check-in gate (SEC-12 / H26). Server is the source of truth
  // for check-in state; direct URL navigation must not bypass the check-in
  // step that lives on the peer session detail page. Rendering a separate
  // inner component keeps hook order stable across gated and ungated states.
  const checkInStatus = useCallerCheckInStatus(campaignId, sessionId)

  if (checkInStatus.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (
    checkInStatus.notAssigned ||
    checkInStatus.isError ||
    !checkInStatus.data?.checked_in
  ) {
    return (
      <Navigate
        to="/campaigns/$campaignId/phone-banking/sessions/$sessionId"
        params={{ campaignId, sessionId }}
      />
    )
  }

  return <ActiveCallingPageInner campaignId={campaignId} sessionId={sessionId} />
}

function ActiveCallingPageInner({
  campaignId,
  sessionId,
}: {
  campaignId: string
  sessionId: string
}) {
  const { data: session } = usePhoneBankSession(campaignId, sessionId)
  const callListId = session?.call_list_id ?? ""
  const { data: callList } = useCallList(campaignId, callListId)
  const scriptId = callList?.script_id

  const claimEntry = useClaimEntry(campaignId, callListId)
  const recordCall = useRecordCall(campaignId, sessionId)
  const selfRelease = useSelfReleaseEntry(campaignId, sessionId)

  // Voice calling hooks
  const { mode: callMode, budget } = useVoiceCapability(campaignId)
  const twilioDevice = useTwilioDevice(campaignId, callMode === "browser")

  const [state, setState] = useState<CallingState>({ phase: "idle" })
  const [surveyResponses, setSurveyResponses] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [activeCallNumber, setActiveCallNumber] = useState<string | null>(null)
  const [dncStatus, setDncStatus] = useState<Record<string, DNCCheckResult>>({})
  const [callingHoursCheck, setCallingHoursCheck] = useState<CallingHoursCheck | null>(null)

  // Track previous call status for auto-advance detection
  const prevCallStatusRef = useRef(twilioDevice.callStatus)

  // Auto-advance to recording phase when browser call ends (500ms delay)
  useEffect(() => {
    const prevStatus = prevCallStatusRef.current
    const currStatus = twilioDevice.callStatus

    prevCallStatusRef.current = currStatus

    // Detect transition to "closed" from an active call state
    if (
      currStatus === "closed" &&
      prevStatus !== "closed" &&
      prevStatus !== "idle" &&
      state.phase === "claimed"
    ) {
      const timer = setTimeout(() => {
        // Auto-advance to recording/outcome phase
        setState((s) => {
          if (s.phase === "claimed") {
            return {
              phase: "recording" as const,
              entry: s.entry,
              startedAt: s.startedAt,
              selectedPhone: s.selectedPhone,
            }
          }
          return s
        })
        setActiveCallNumber(null)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [twilioDevice.callStatus, state.phase])

  // Fetch DNC status and calling hours when a voter is claimed
  const fetchComplianceChecks = useCallback(
    async (entry: CallListEntry) => {
      // DNC checks for each phone number
      const dncResults: Record<string, DNCCheckResult> = {}
      await Promise.all(
        entry.phone_numbers.map(async (phone) => {
          try {
            const result = await api
              .post(`api/v1/campaigns/${campaignId}/voice/dnc-check`, {
                json: { phone_number: phone.value },
              })
              .json<DNCCheckResult>()
            dncResults[phone.value] = result
          } catch {
            // If DNC check fails, allow the call (server-side TwiML will still block)
            dncResults[phone.value] = { blocked: false, message: null }
          }
        }),
      )
      setDncStatus(dncResults)

      // Calling hours check
      try {
        const hours = await api
          .get(`api/v1/campaigns/${campaignId}/voice/calling-hours`)
          .json<CallingHoursCheck>()
        setCallingHoursCheck(hours)
      } catch {
        // If hours check fails, allow calling (server-side TwiML will still block)
        setCallingHoursCheck(null)
      }
    },
    [campaignId],
  )

  // call_started_at is set when entry is claimed; call_ended_at is set when outcome button clicked
  async function handleClaim() {
    if (!callListId) return
    setState({ phase: "claiming" })
    try {
      const entries = await claimEntry.mutateAsync()
      if (entries.length === 0) {
        setState({ phase: "complete" })
        return
      }
      const entry = entries[0]
      const primaryPhone =
        entry.phone_numbers.find((p) => p.is_primary)?.value ??
        entry.phone_numbers[0]?.value ??
        ""
      setState({
        phase: "claimed",
        entry,
        startedAt: new Date().toISOString(),
        selectedPhone: primaryPhone,
      })
      setSurveyResponses({})
      setNotes("")
      setActiveCallNumber(null)
      setDncStatus({})
      setCallingHoursCheck(null)

      // Fire compliance checks in background (non-blocking)
      fetchComplianceChecks(entry)
    } catch {
      setState({ phase: "idle" })
      toast.error("Failed to claim next voter")
    }
  }

  function handleBrowserCall(e164: string) {
    setActiveCallNumber(e164)
    twilioDevice.connect(e164, campaignId)
  }

  function handleHangUp() {
    twilioDevice.disconnect()
  }

  function handleCallStarted(e164: string) {
    // For tel: mode, just track which number was called
    setActiveCallNumber(e164)
  }

  async function handleOutcome(resultCode: string) {
    // Accept outcomes from both "claimed" and "recording" phases
    const currentState = state
    if (currentState.phase !== "claimed" && currentState.phase !== "recording") return
    const endedAt = new Date().toISOString()
    const payload: RecordCallPayload = buildRecordCallPayload({
      call_list_entry_id: currentState.entry.id,
      result_code: resultCode,
      phone_number_used: currentState.selectedPhone,
      call_started_at: currentState.startedAt,
      call_ended_at: endedAt,
      notes,
      survey_responses: resultCode === "answered"
        ? Object.entries(surveyResponses).map(
            ([question_id, answer_value]) => ({ question_id, answer_value }),
          )
        : undefined,
      survey_complete: resultCode === "answered" && Object.keys(surveyResponses).length > 0
        ? true
        : undefined,
    })
    try {
      await recordCall.mutateAsync(payload)
      setState({ phase: "recorded", entry: currentState.entry, resultCode })
      setActiveCallNumber(null)
    } catch {
      toast.error("Failed to record call")
    }
  }

  async function handleSkip() {
    if (state.phase !== "claimed" && state.phase !== "recording") return
    try {
      await selfRelease.mutateAsync(state.entry.id)
      setState({ phase: "idle" })
      setActiveCallNumber(null)
      toast.success("Entry released")
    } catch {
      toast.error("Failed to skip entry")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/campaigns/$campaignId/phone-banking/sessions/$sessionId"
          params={{ campaignId, sessionId }}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Session
        </Link>
        <h1 className="text-xl font-semibold">Active Calling</h1>
      </div>

      {budget && budget.state !== "healthy" ? (
        <Alert
          variant={budget.state === "over_limit" ? "destructive" : "default"}
          data-testid="call-budget-banner"
        >
          {budget.state === "over_limit" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          <AlertTitle>
            {budget.state === "over_limit"
              ? "Calling is paused by the org soft budget"
              : budget.state === "near_limit"
                ? "Calling spend is nearing the org soft budget"
                : "Recent call costs are still pending"}
          </AlertTitle>
          <AlertDescription>
            {budget.state === "over_limit"
              ? "New browser calls will be blocked until an org owner updates the Twilio budget."
              : budget.state === "near_limit"
                ? "Calls can still start, but the organization is close to its configured Twilio threshold."
                : "Twilio has not finalized pricing for some recent calls yet."}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* State: idle */}
      {state.phase === "idle" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground">Ready to start calling</p>
          <Button onClick={handleClaim} size="lg" disabled={!callListId}>
            Start Calling
          </Button>
        </div>
      )}

      {/* State: claiming */}
      {state.phase === "claiming" && (
        <div className="flex justify-center py-16">
          <div className="space-y-4 w-64">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
      )}

      {/* State: claimed -- two-panel layout */}
      {state.phase === "claimed" && (
        <div className="flex gap-6 min-h-[500px]">
          {/* Left panel: voter info */}
          <div className="w-80 shrink-0 space-y-4 border-r pr-6">
            <VoterInfoPanel
              entry={state.entry}
              selectedPhone={state.selectedPhone}
              onPhoneSelect={(phone) =>
                setState({ ...state, selectedPhone: phone })
              }
              campaignId={campaignId}
              twilioDevice={twilioDevice}
              callMode={callMode}
              activeCallNumber={activeCallNumber}
              dncStatus={dncStatus}
              callingHoursCheck={callingHoursCheck}
              onBrowserCall={handleBrowserCall}
              onCallStarted={handleCallStarted}
            />
          </div>
          {/* Right panel: survey + outcomes */}
          <div className="flex-1 space-y-6">
            <SurveyPanel
              campaignId={campaignId}
              scriptId={scriptId}
              surveyResponses={surveyResponses}
              notes={notes}
              onResponseChange={(qId, val) =>
                setSurveyResponses((r) => ({ ...r, [qId]: val }))
              }
              onNotesChange={setNotes}
            />
            <OutcomePanel
              onOutcome={handleOutcome}
              onSkip={handleSkip}
              isPending={recordCall.isPending || selfRelease.isPending}
            />
          </div>
        </div>
      )}

      {/* State: recording -- same layout, auto-advanced from browser call end */}
      {state.phase === "recording" && (
        <div className="flex gap-6 min-h-[500px]">
          {/* Left panel: voter info (read-only) */}
          <div className="w-80 shrink-0 space-y-4 border-r pr-6">
            <VoterInfoPanel
              entry={state.entry}
              selectedPhone={state.selectedPhone}
              onPhoneSelect={(phone) =>
                setState({ ...state, selectedPhone: phone })
              }
              campaignId={campaignId}
              twilioDevice={twilioDevice}
              callMode={callMode}
              activeCallNumber={activeCallNumber}
              dncStatus={dncStatus}
              callingHoursCheck={callingHoursCheck}
              onBrowserCall={handleBrowserCall}
              onCallStarted={handleCallStarted}
            />
          </div>
          {/* Right panel: survey + outcomes */}
          <div className="flex-1 space-y-6">
            <SurveyPanel
              campaignId={campaignId}
              scriptId={scriptId}
              surveyResponses={surveyResponses}
              notes={notes}
              onResponseChange={(qId, val) =>
                setSurveyResponses((r) => ({ ...r, [qId]: val }))
              }
              onNotesChange={setNotes}
            />
            <OutcomePanel
              onOutcome={handleOutcome}
              onSkip={handleSkip}
              isPending={recordCall.isPending || selfRelease.isPending}
            />
          </div>
        </div>
      )}

      {/* State: recorded -- confirmation */}
      {state.phase === "recorded" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Call recorded</p>
            <p className="text-muted-foreground">
              Outcome: {state.resultCode.replace(/_/g, " ")}
            </p>
          </div>
          <Button onClick={handleClaim} size="lg">
            Next Voter
          </Button>
        </div>
      )}

      {/* State: complete */}
      {state.phase === "complete" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-lg font-medium">All done!</p>
          <p className="text-muted-foreground">
            No more voters available in this call list.
          </p>
          <Link
            to="/campaigns/$campaignId/phone-banking/sessions/$sessionId"
            params={{ campaignId, sessionId }}
          >
            <Button variant="outline">Back to Session</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
