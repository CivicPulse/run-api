import { useState, useEffect } from "react"
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
import { useSurveyScript, useRecordResponses } from "@/hooks/useSurveys"
import type { QuestionResponse } from "@/types/survey"

interface InlineSurveyProps {
  campaignId: string
  scriptId: string
  voterId: string
  open: boolean
  onComplete: () => void
  onSkip: () => void
}

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

export function InlineSurvey({
  campaignId,
  scriptId,
  voterId,
  open,
  onComplete,
  onSkip,
}: InlineSurveyProps) {
  const { data: scriptDetail } = useSurveyScript(campaignId, scriptId)
  const recordMutation = useRecordResponses(campaignId, scriptId)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const questions = scriptDetail?.questions
    ? [...scriptDetail.questions].sort((a, b) => a.position - b.position)
    : []

  // If no scriptId or no questions, skip immediately
  useEffect(() => {
    if (!scriptId) {
      onSkip()
      return
    }
    if (scriptDetail && questions.length === 0) {
      onSkip()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, scriptDetail])

  // Reset answers when voterId changes
  useEffect(() => {
    setAnswers({})
  }, [voterId])

  const handleSave = () => {
    const batchData = {
      voter_id: voterId,
      responses: Object.entries(answers).map(([questionId, value]) => ({
        question_id: questionId,
        voter_id: voterId,
        answer_value: value,
      })),
    }
    recordMutation.mutate(batchData, { onSuccess: () => onComplete() })
  }

  const updateAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

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
      >
        <SheetHeader>
          <SheetTitle>Survey Questions</SheetTitle>
        </SheetHeader>

        <div aria-live="polite" className="sr-only">
          {questions.length > 0
            ? `Survey questions. ${questions.length} questions.`
            : ""}
        </div>

        <div className="overflow-y-auto flex-1 space-y-6 py-4 px-4">
          {questions.map((question) => (
            <div key={question.id} className="space-y-2">
              <p className="text-base font-medium">{question.question_text}</p>

              {question.question_type === "multiple_choice" && (
                <RadioGroup
                  value={answers[question.id] ?? ""}
                  onValueChange={(val) => updateAnswer(question.id, val)}
                >
                  {(
                    (question.options as { choices?: string[] })?.choices ?? []
                  ).map((choice) => (
                    <Label
                      key={choice}
                      className="min-h-11 flex items-center gap-2 cursor-pointer"
                    >
                      <RadioGroupItem value={choice} />
                      {choice}
                    </Label>
                  ))}
                </RadioGroup>
              )}

              {question.question_type === "scale" && (
                <ScaleQuestion
                  question={question}
                  value={answers[question.id] ?? ""}
                  onChange={(val) => updateAnswer(question.id, val)}
                />
              )}

              {question.question_type === "free_text" && (
                <Textarea
                  className="min-h-[80px]"
                  value={answers[question.id] ?? ""}
                  onChange={(e) => updateAnswer(question.id, e.target.value)}
                  placeholder="Type your answer..."
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-4 border-t px-4 pb-4">
          <Button variant="ghost" onClick={onSkip} className="min-h-11">
            Skip Survey
          </Button>
          <Button
            onClick={handleSave}
            disabled={recordMutation.isPending}
            className="min-h-11"
          >
            Save Answers
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
