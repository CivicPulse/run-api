import { useSurveyScript, useRecordResponses, useVoterResponses } from "@/hooks/useSurveys"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2 } from "lucide-react"
import { useState, useEffect } from "react"
import type { QuestionResponse } from "@/types/survey"

interface SurveyWidgetProps {
  campaignId: string
  scriptId: string
  voterId: string
  onComplete?: () => void
}

export function SurveyWidget({
  campaignId,
  scriptId,
  voterId,
  onComplete,
}: SurveyWidgetProps) {
  const { data: script, isLoading: scriptLoading } = useSurveyScript(
    campaignId,
    scriptId,
  )
  const { data: existingResponses, isLoading: responsesLoading } =
    useVoterResponses(campaignId, scriptId, voterId)
  const recordResponses = useRecordResponses(campaignId, scriptId)

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const questions = script?.questions ?? []
  const isLoading = scriptLoading || responsesLoading
  const hasExistingResponses =
    existingResponses && existingResponses.length > 0

  // Pre-fill from existing responses
  useEffect(() => {
    if (existingResponses && existingResponses.length > 0) {
      const prefilled: Record<string, string> = {}
      for (const r of existingResponses) {
        prefilled[r.question_id] = r.answer_value
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: pre-fill form state from fetched server data
      setAnswers(prefilled)
      setSubmitted(true)
    }
  }, [existingResponses])

  // Reset when voter changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset form when voter prop changes
    setAnswers({})
    setSubmitted(false)
  }, [voterId])

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const allAnswered = questions.every((q) => answers[q.id]?.trim())

  const handleSubmit = () => {
    const responses = questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => ({
        question_id: q.id,
        voter_id: voterId,
        answer_value: answers[q.id],
      }))

    recordResponses.mutate(
      { voter_id: voterId, responses },
      {
        onSuccess: () => {
          setSubmitted(true)
          onComplete?.()
        },
      },
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!script || questions.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium">{script.title}</CardTitle>
        {submitted && (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {hasExistingResponses ? "Recorded" : "Submitted"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {questions.map((q, idx) => (
          <QuestionField
            key={q.id}
            index={idx}
            question={q}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswer(q.id, v)}
            disabled={submitted}
          />
        ))}

        {!submitted && (
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!allAnswered || recordResponses.isPending}
          >
            {recordResponses.isPending ? "Submitting..." : "Submit Responses"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Question field renderer
// ---------------------------------------------------------------------------

function QuestionField({
  index,
  question,
  value,
  onChange,
  disabled,
}: {
  index: number
  question: QuestionResponse
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">
        {index + 1}. {question.question_text}
      </Label>

      {question.question_type === "multiple_choice" &&
        question.options &&
        "choices" in question.options && (
          <RadioGroup
            value={value}
            onValueChange={onChange}
            disabled={disabled}
          >
            {(question.options.choices as string[]).map((choice) => (
              <div key={choice} className="flex items-center space-x-2">
                <RadioGroupItem value={choice} id={`${question.id}-${choice}`} />
                <Label
                  htmlFor={`${question.id}-${choice}`}
                  className="font-normal"
                >
                  {choice}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

      {question.question_type === "scale" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">1</span>
          <Input
            type="range"
            min={1}
            max={
              question.options && "max" in question.options
                ? Number(question.options.max)
                : 10
            }
            value={value || "5"}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-8"
          />
          <span className="text-xs text-muted-foreground">
            {question.options && "max" in question.options
              ? String(question.options.max)
              : "10"}
          </span>
          <span className="min-w-[2rem] text-center text-sm font-medium">
            {value || "5"}
          </span>
        </div>
      )}

      {question.question_type === "free_text" && (
        <Textarea
          placeholder="Type your answer..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}
