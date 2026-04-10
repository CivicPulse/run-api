import { useState, useId, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2 } from "lucide-react"
import { useSurveyScript, useRecordResponses } from "@/hooks/useSurveys"
import type { QuestionResponse } from "@/types/survey"
import type { RecordCallSurveyResponse } from "@/types/phone-bank-session"

interface BaseInlineSurveyProps {
  campaignId: string
  scriptId: string
  open: boolean
  onSkip: () => void
  voterName?: string
}

interface DirectSaveInlineSurveyProps extends BaseInlineSurveyProps {
  mode?: "direct-save"
  voterId: string
  onComplete: () => void
}

interface ControlledInlineSurveyProps extends BaseInlineSurveyProps {
  mode: "controlled"
  onSubmitDraft: (draft: {
    notes: string
    surveyResponses: RecordCallSurveyResponse[]
    surveyComplete: boolean
  }) => void | Promise<void>
  isSubmitting?: boolean
  submitLabel?: string
}

type InlineSurveyProps = DirectSaveInlineSurveyProps | ControlledInlineSurveyProps

function ScaleQuestion({
  question,
  value,
  onChange,
}: {
  question: QuestionResponse
  value: string
  onChange: (val: string) => void
}) {
  const opts = question.options as Record<string, unknown> | null
  const min = typeof opts?.min === "number" ? opts.min : 1
  const max = typeof opts?.max === "number" ? opts.max : 10

  const values: number[] = []
  for (let i = min; i <= max; i++) values.push(i)

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((n) => (
        <Button
          key={n}
          type="button"
          variant={value === String(n) ? "default" : "outline"}
          size="sm"
          className="min-h-11 min-w-11"
          onClick={() => onChange(String(n))}
        >
          {n}
        </Button>
      ))}
    </div>
  )
}

function isRenderableQuestion(question: QuestionResponse): boolean {
  if (!question?.id || !question?.question_text || !question?.question_type) return false

  if (question.question_type === "multiple_choice") {
    const choices = (question.options as { choices?: string[] } | null)?.choices
    return Array.isArray(choices) && choices.every((choice) => typeof choice === "string") && choices.length > 0
  }

  if (question.question_type === "scale") {
    const opts = question.options as Record<string, unknown> | null
    const min = opts?.min
    const max = opts?.max
    return (min === undefined || typeof min === "number") && (max === undefined || typeof max === "number")
  }

  return question.question_type === "free_text"
}

export function InlineSurvey(props: InlineSurveyProps) {
  const { campaignId, scriptId, open, onSkip, voterName } = props
  const isControlled = props.mode === "controlled"

  const choiceIdPrefix = useId()
  const scriptQuery = useSurveyScript(campaignId, scriptId)
  const recordMutation = useRecordResponses(campaignId, scriptId)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  // Track the (open, scriptId) pair so we can reset form state when either
  // changes — derived during render per React's recommendation instead of
  // an effect that would cascade renders.
  const resetKey = `${open ? "1" : "0"}:${scriptId}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setAnswers({})
    setNotes("")
  }

  const scriptData = scriptQuery.data
  const rawQuestions = useMemo(
    () => (Array.isArray(scriptData?.questions) ? scriptData.questions : []),
    [scriptData],
  )

  const questions = useMemo(
    () => [...rawQuestions].sort((a, b) => a.position - b.position),
    [rawQuestions],
  )

  const renderableQuestions = useMemo(
    () => questions.filter(isRenderableQuestion),
    [questions],
  )

  const hasMalformedQuestions = questions.length > 0 && renderableQuestions.length !== questions.length
  const requiresSurvey = scriptId.length > 0
  const showQuestionState = requiresSurvey && (scriptQuery.isLoading || scriptQuery.isError || hasMalformedQuestions || renderableQuestions.length === 0)
  const requiresNotes = isControlled

  const orderedResponses = useMemo<RecordCallSurveyResponse[]>(() => (
    renderableQuestions.flatMap((question) => {
      const rawValue = answers[question.id] ?? ""
      const answerValue = question.question_type === "free_text" ? rawValue.trim() : rawValue
      return answerValue
        ? [{ question_id: question.id, answer_value: answerValue }]
        : []
    })
  ), [answers, renderableQuestions])

  const isSurveyComplete = !requiresSurvey || (
    !showQuestionState
    && orderedResponses.length === renderableQuestions.length
  )

  const isNotesComplete = !requiresNotes || notes.trim().length > 0
  const canSubmitControlled =
    isNotesComplete &&
    isSurveyComplete &&
    !showQuestionState &&
    !(props.mode === "controlled" && props.isSubmitting)

  const handleDirectSave = () => {
    if (props.mode === "controlled") return

    const batchData = {
      voter_id: props.voterId,
      responses: orderedResponses.map((response) => ({
        question_id: response.question_id,
        voter_id: props.voterId,
        answer_value: response.answer_value,
      })),
    }

    recordMutation.mutate(batchData, { onSuccess: () => props.onComplete() })
  }

  const handleControlledSubmit = async () => {
    if (props.mode !== "controlled" || !canSubmitControlled) return

    await props.onSubmitDraft({
      notes: notes.trim(),
      surveyResponses: orderedResponses,
      surveyComplete: requiresSurvey ? orderedResponses.length === renderableQuestions.length : false,
    })
  }

  const submitLabel = props.mode === "controlled" ? (props.submitLabel ?? "Save Call") : "Save Answers"
  const isPending = props.mode === "controlled" ? Boolean(props.isSubmitting) : recordMutation.isPending

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onSkip()
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[70dvh] rounded-t-2xl flex flex-col"
        aria-label={voterName ? `Survey questions for ${voterName}` : "Survey questions"}
      >
        <SheetHeader>
          <SheetTitle>{isControlled ? "Record Answered Call" : "Survey Questions"}</SheetTitle>
        </SheetHeader>

        <div aria-live="polite" className="sr-only">
          {requiresSurvey && renderableQuestions.length > 0
            ? `Survey questions. ${renderableQuestions.length} questions.`
            : isControlled
              ? "Call notes form."
              : ""}
        </div>

        <div className="overflow-y-auto flex-1 space-y-6 py-4 px-4">
          {requiresSurvey && scriptQuery.isLoading && (
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading survey questions…
            </div>
          )}

          {requiresSurvey && scriptQuery.isError && (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <p>Couldn&apos;t load the survey questions. Retry before saving this answered call.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => scriptQuery.refetch()}>
                Retry Survey Load
              </Button>
            </div>
          )}

          {requiresSurvey && !scriptQuery.isLoading && !scriptQuery.isError && hasMalformedQuestions && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Some survey questions were malformed, so this call can&apos;t be saved until the script is fixed.
            </div>
          )}

          {requiresSurvey && !scriptQuery.isLoading && !scriptQuery.isError && !hasMalformedQuestions && renderableQuestions.length === 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              This script has no usable questions yet. Add questions or remove the script before saving an answered call.
            </div>
          )}

          {!showQuestionState && renderableQuestions.map((question) => (
            <div key={question.id} className="space-y-2">
              <p className="text-base font-medium">{question.question_text}</p>

              {question.question_type === "multiple_choice" && (
                <RadioGroup
                  value={answers[question.id] ?? ""}
                  onValueChange={(val) => setAnswers((prev) => ({ ...prev, [question.id]: val }))}
                >
                  {(
                    (question.options as { choices?: string[] } | null)?.choices ?? []
                  ).map((choice, index) => {
                    const choiceId = `${choiceIdPrefix}-${question.id}-${index}`
                    return (
                      <div
                        key={choice}
                        className="min-h-11 flex items-center gap-2"
                      >
                        <RadioGroupItem value={choice} id={choiceId} />
                        <Label htmlFor={choiceId} className="cursor-pointer flex-1">
                          {choice}
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              )}

              {question.question_type === "scale" && (
                <ScaleQuestion
                  question={question}
                  value={answers[question.id] ?? ""}
                  onChange={(val) => setAnswers((prev) => ({ ...prev, [question.id]: val }))}
                />
              )}

              {question.question_type === "free_text" && (
                <Textarea
                  className="min-h-[80px]"
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Type your answer..."
                />
              )}
            </div>
          ))}

          {isControlled && (
            <div className="space-y-2">
              <Label htmlFor="field-call-notes" className="text-sm font-medium">
                Call Notes
              </Label>
              <Textarea
                id="field-call-notes"
                className="min-h-[100px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened on this call?"
              />
              {!isNotesComplete && (
                <p className="text-sm text-destructive">Add notes before saving this answered call.</p>
              )}
              {requiresSurvey && !showQuestionState && !isSurveyComplete && (
                <p className="text-sm text-destructive">Answer every survey question before saving this call.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t px-4 pb-4">
          <Button variant="ghost" onClick={onSkip} className="min-h-11">
            {isControlled ? "Cancel" : "Skip Survey"}
          </Button>
          <Button
            onClick={props.mode === "controlled" ? handleControlledSubmit : handleDirectSave}
            disabled={isPending || (props.mode === "controlled" ? !canSubmitControlled : showQuestionState)}
            className="min-h-11"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
