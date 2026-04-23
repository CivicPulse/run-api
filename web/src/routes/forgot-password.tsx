import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import ky from "ky"
import { CheckCircle2, Loader2, Vote } from "lucide-react"
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
  email: z.string().email("Enter a valid email"),
})

type FormValues = z.infer<typeof schema>

function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await ky.post("/api/v1/auth/forgot-password", {
        json: { email: values.email },
        credentials: "include",
      })
    } catch {
      // Intentionally ignored — server returns 202 regardless to prevent
      // user enumeration. Network failures surface as the same success
      // screen so we don't leak signal either way.
    }
    setSubmitted(true)
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {submitted ? (
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : (
              <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
          </div>
          <CardTitle>
            {submitted ? "Check your email" : "Reset your password"}
          </CardTitle>
          <CardDescription>
            {submitted
              ? "If that email exists, we sent a reset link."
              : "Enter your email and we'll send a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <Button asChild className="w-full" variant="outline">
              <Link to="/login" search={{ redirect: undefined, reset: undefined }}>Back to sign in</Link>
            </Button>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
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
                Send reset link
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" search={{ redirect: undefined, reset: undefined }} className="underline hover:text-foreground">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
})
