import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  usePhoneBankSession,
  useClaimEntry,
  useRecordCall,
  useSelfReleaseEntry,
} from "@/hooks/usePhoneBankSessions"
import { useCallList } from "@/hooks/useCallLists"
import { OUTCOME_GROUPS } from "@/types/phone-bank-session"
import type { RecordCallPayload } from "@/types/phone-bank-session"
import type { CallListEntry } from "@/types/call-list"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
}: {
  entry: CallListEntry
  selectedPhone: string
  onPhoneSelect: (phone: string) => void
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
          <div className="flex flex-col gap-2">
            {entry.phone_numbers.map((phone) => (
              <Button
                key={phone.phone_id}
                variant={selectedPhone === phone.value ? "default" : "outline"}
                size="sm"
                className="justify-start font-mono"
                onClick={() => onPhoneSelect(phone.value)}
              >
                {phone.value}
                <span className="ml-2 text-xs opacity-70 capitalize">{phone.type}</span>
                {phone.is_primary && (
                  <span className="ml-auto text-xs opacity-70">Primary</span>
                )}
              </Button>
            ))}
          </div>
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

  const { data: session } = usePhoneBankSession(campaignId, sessionId)
  const callListId = session?.call_list_id ?? ""
  const { data: callList } = useCallList(campaignId, callListId)
  const scriptId = callList?.script_id

  const claimEntry = useClaimEntry(campaignId, callListId)
  const recordCall = useRecordCall(campaignId, sessionId)
  const selfRelease = useSelfReleaseEntry(campaignId, sessionId)

  const [state, setState] = useState<CallingState>({ phase: "idle" })
  const [surveyResponses, setSurveyResponses] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")

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
    } catch {
      setState({ phase: "idle" })
      toast.error("Failed to claim next voter")
    }
  }

  async function handleOutcome(resultCode: string) {
    if (state.phase !== "claimed") return
    const endedAt = new Date().toISOString()
    const payload: RecordCallPayload = {
      call_list_entry_id: state.entry.id,
      result_code: resultCode,
      phone_number_used: state.selectedPhone,
      call_started_at: state.startedAt,
      call_ended_at: endedAt,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      // Survey responses only sent when call was answered
      ...(resultCode === "answered" && Object.keys(surveyResponses).length > 0
        ? {
            survey_responses: Object.entries(surveyResponses).map(
              ([question_id, answer_value]) => ({ question_id, answer_value }),
            ),
            survey_complete: true,
          }
        : {}),
    }
    try {
      await recordCall.mutateAsync(payload)
      setState({ phase: "recorded", entry: state.entry, resultCode })
    } catch {
      toast.error("Failed to record call")
    }
  }

  async function handleSkip() {
    if (state.phase !== "claimed") return
    try {
      await selfRelease.mutateAsync(state.entry.id)
      setState({ phase: "idle" })
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
        <h2 className="text-xl font-semibold">Active Calling</h2>
      </div>

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

      {/* State: claimed — two-panel layout */}
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

      {/* State: recorded — confirmation */}
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
