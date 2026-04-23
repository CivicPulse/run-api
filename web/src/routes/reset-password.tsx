import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import ky, { HTTPError } from "ky"
import { AlertCircle, Loader2, Vote } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const schema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters"),
})

type FormValues = z.infer<typeof schema>

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    if (!token) {
      setError("Missing reset token. Request a new reset link.")
      return
    }
    try {
      await ky.post("/api/v1/auth/reset-password", {
        json: { token, password: values.password },
        credentials: "include",
      })
      navigate({ to: "/login", search: { redirect: undefined, reset: true } })
    } catch (err) {
      if (err instanceof HTTPError) {
        let message = "Password reset failed."
        try {
          const body = await err.response.clone().json()
          const detail = (body as { detail?: unknown }).detail
          if (typeof detail === "string") message = detail
          else if (
            detail &&
            typeof detail === "object" &&
            "reason" in detail &&
            typeof (detail as { reason?: string }).reason === "string"
          ) {
            message = (detail as { reason: string }).reason
          } else if (
            detail &&
            typeof detail === "object" &&
            "code" in detail
          ) {
            const code = (detail as { code?: string }).code
            if (code === "RESET_PASSWORD_BAD_TOKEN") {
              message = "This reset link is invalid or has expired."
            } else if (code === "RESET_PASSWORD_INVALID_PASSWORD") {
              const reason = (detail as { reason?: string }).reason
              message = reason || "Choose a stronger password."
            }
          }
        } catch {
          // ignore parse failures
        }
        setError(message)
      } else {
        setError("Network error — please try again.")
      }
    }
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Pick a password you don't use elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Reset failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                aria-invalid={!!form.formState.errors.password}
                {...form.register("password")}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 12 characters. Avoid common passwords.
              </p>
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reset password
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" search={{ redirect: undefined, reset: undefined }} className="underline hover:text-foreground">
                Back to sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
})
