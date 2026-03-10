import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import {
  useSurveyScript,
  useUpdateScript,
  useAddQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  useReorderQuestions,
} from "@/hooks/useSurveys"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import {
  ArrowLeft,
  GripVertical,
  HelpCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import type { QuestionCreate, QuestionType, QuestionUpdate, ScriptStatus } from "@/types/survey"

const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  scale: "Scale",
  free_text: "Free Text",
}

const statusVariant: Record<ScriptStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  archived: "secondary",
}

function ScriptDetail() {
  const { campaignId, scriptId } = useParams({
    from: "/campaigns/$campaignId/surveys/$scriptId",
  })
  const navigate = useNavigate()
  const { data: script, isLoading } = useSurveyScript(campaignId, scriptId)
  const updateScript = useUpdateScript(campaignId, scriptId)
  const addQuestion = useAddQuestion(campaignId, scriptId)
  const deleteQuestion = useDeleteQuestion(campaignId, scriptId)
  const reorder = useReorderQuestions(campaignId, scriptId)

  const [addOpen, setAddOpen] = useState(false)
  const [editQuestion, setEditQuestion] = useState<{
    id: string
    question_text: string
    question_type: QuestionType
    options: Record<string, unknown> | null
  } | null>(null)
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null)

  // Add question form state
  const [newText, setNewText] = useState("")
  const [newType, setNewType] = useState<QuestionType>("multiple_choice")
  const [newOptions, setNewOptions] = useState("")

  const isDraft = script?.status === "draft"
  const questions = script?.questions ?? []

  const parseOptions = (raw: string): Record<string, unknown> | undefined => {
    if (!raw.trim()) return undefined
    const choices = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    return { choices }
  }

  const handleAddQuestion = () => {
    const data: QuestionCreate = {
      question_text: newText,
      question_type: newType,
      options: parseOptions(newOptions),
    }
    addQuestion.mutate(data, {
      onSuccess: () => {
        setAddOpen(false)
        setNewText("")
        setNewType("multiple_choice")
        setNewOptions("")
      },
    })
  }

  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    const ids = questions.map((q) => q.id)
    const swapIdx = direction === "up" ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= ids.length) return
    ;[ids[index], ids[swapIdx]] = [ids[swapIdx], ids[index]]
    reorder.mutate(ids)
  }

  const handleStatusChange = (newStatus: ScriptStatus) => {
    updateScript.mutate({ status: newStatus })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!script) {
    return (
      <EmptyState
        icon={HelpCircle}
        title="Script not found"
        description="This survey script may have been deleted."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                navigate({ to: `/campaigns/${campaignId}/surveys` })
              }
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{script.title}</h2>
            <Badge variant={statusVariant[script.status]}>{script.status}</Badge>
          </div>
          {script.description && (
            <p className="ml-10 text-sm text-muted-foreground">
              {script.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button
              size="sm"
              onClick={() => handleStatusChange("active")}
              disabled={updateScript.isPending}
            >
              Activate
            </Button>
          )}
          {script.status === "active" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleStatusChange("archived")}
              disabled={updateScript.isPending}
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-medium">
            Questions ({questions.length})
          </h3>
          {isDraft && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Question
            </Button>
          )}
        </div>

        {questions.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title="No questions yet"
            description="Add questions to build your survey script."
            action={
              isDraft ? (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id}>
                <CardHeader className="flex flex-row items-center gap-3 py-3">
                  {isDraft && (
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={idx === 0 || reorder.isPending}
                        onClick={() => handleMoveQuestion(idx, "up")}
                      >
                        <GripVertical className="h-3 w-3 rotate-90" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={
                          idx === questions.length - 1 || reorder.isPending
                        }
                        onClick={() => handleMoveQuestion(idx, "down")}
                      >
                        <GripVertical className="h-3 w-3 -rotate-90" />
                      </Button>
                    </div>
                  )}
                  <div className="flex-1">
                    <CardTitle className="text-sm font-medium">
                      {idx + 1}. {q.question_text}
                    </CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {questionTypeLabels[q.question_type]}
                      </Badge>
                      {q.options &&
                        "choices" in q.options &&
                        Array.isArray(q.options.choices) && (
                          <span className="text-xs text-muted-foreground">
                            {q.options.choices.length} choices
                          </span>
                        )}
                    </div>
                  </div>
                  {isDraft && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEditQuestion({
                            id: q.id,
                            question_text: q.question_text,
                            question_type: q.question_type,
                            options: q.options,
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteQuestionId(q.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                {q.options &&
                  "choices" in q.options &&
                  Array.isArray(q.options.choices) && (
                    <CardContent className="pt-0 pb-3">
                      <ul className="ml-6 list-disc text-sm text-muted-foreground">
                        {(q.options.choices as string[]).map((choice, ci) => (
                          <li key={ci}>{choice}</li>
                        ))}
                      </ul>
                    </CardContent>
                  )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Question Dialog */}
      <QuestionFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Question"
        questionText={newText}
        onQuestionTextChange={setNewText}
        questionType={newType}
        onQuestionTypeChange={setNewType}
        optionsText={newOptions}
        onOptionsTextChange={setNewOptions}
        isPending={addQuestion.isPending}
        onSubmit={handleAddQuestion}
        submitLabel="Add"
      />

      {/* Edit Question Dialog */}
      {editQuestion && (
        <EditQuestionDialog
          campaignId={campaignId}
          scriptId={scriptId}
          question={editQuestion}
          onClose={() => setEditQuestion(null)}
        />
      )}

      {/* Delete Question Confirm */}
      <ConfirmDialog
        open={!!deleteQuestionId}
        onOpenChange={(open) => {
          if (!open) setDeleteQuestionId(null)
        }}
        title="Delete Question"
        description="Are you sure you want to remove this question from the script?"
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteQuestion.isPending}
        onConfirm={() => {
          if (deleteQuestionId) {
            deleteQuestion.mutate(deleteQuestionId, {
              onSuccess: () => setDeleteQuestionId(null),
            })
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared question form dialog
// ---------------------------------------------------------------------------

function QuestionFormDialog({
  open,
  onOpenChange,
  title,
  questionText,
  onQuestionTextChange,
  questionType,
  onQuestionTypeChange,
  optionsText,
  onOptionsTextChange,
  isPending,
  onSubmit,
  submitLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  questionText: string
  onQuestionTextChange: (v: string) => void
  questionType: QuestionType
  onQuestionTypeChange: (v: QuestionType) => void
  optionsText: string
  onOptionsTextChange: (v: string) => void
  isPending: boolean
  onSubmit: () => void
  submitLabel: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Question Text</Label>
            <Textarea
              placeholder="Enter question..."
              value={questionText}
              onChange={(e) => onQuestionTextChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={questionType}
              onValueChange={(v) => onQuestionTypeChange(v as QuestionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                <SelectItem value="scale">Scale</SelectItem>
                <SelectItem value="free_text">Free Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {questionType === "multiple_choice" && (
            <div className="space-y-2">
              <Label>Choices (one per line)</Label>
              <Textarea
                placeholder={"Strongly Agree\nAgree\nDisagree\nStrongly Disagree"}
                value={optionsText}
                onChange={(e) => onOptionsTextChange(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!questionText.trim() || isPending}
          >
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit question wrapper (needs its own hook instance)
// ---------------------------------------------------------------------------

function EditQuestionDialog({
  campaignId,
  scriptId,
  question,
  onClose,
}: {
  campaignId: string
  scriptId: string
  question: {
    id: string
    question_text: string
    question_type: QuestionType
    options: Record<string, unknown> | null
  }
  onClose: () => void
}) {
  const updateQuestion = useUpdateQuestion(campaignId, scriptId, question.id)

  const [text, setText] = useState(question.question_text)
  const [type, setType] = useState<QuestionType>(question.question_type)
  const [opts, setOpts] = useState(
    question.options && "choices" in question.options
      ? (question.options.choices as string[]).join("\n")
      : "",
  )

  const handleSubmit = () => {
    const data: QuestionUpdate = {
      question_text: text,
      question_type: type,
    }
    if (type === "multiple_choice" && opts.trim()) {
      data.options = {
        choices: opts
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      }
    }
    updateQuestion.mutate(data, { onSuccess: onClose })
  }

  return (
    <QuestionFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Edit Question"
      questionText={text}
      onQuestionTextChange={setText}
      questionType={type}
      onQuestionTypeChange={setType}
      optionsText={opts}
      onOptionsTextChange={setOpts}
      isPending={updateQuestion.isPending}
      onSubmit={handleSubmit}
      submitLabel="Save"
    />
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/surveys/$scriptId",
)({
  component: ScriptDetail,
})
