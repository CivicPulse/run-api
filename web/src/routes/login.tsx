import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Loader2, Vote } from "lucide-react"
import { toast } from "sonner"
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
import { isSafeRedirect } from "@/lib/safeRedirect"
import { useAuthStore } from "@/stores/authStore"
import ky from "ky"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

function LoginPage() {
  const navigate = useNavigate()
  const status = useAuthStore((s) => s.status)
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword)
  const { redirect, reset } = Route.useSearch()
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  useEffect(() => {
    if (status === "authenticated") {
      const target = isSafeRedirect(redirect) ? redirect : "/"
      navigate({ to: target })
    }
  }, [status, redirect, navigate])

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    setUnverifiedEmail(null)
    const failure = await loginWithPassword(values.email, values.password)
    if (failure) {
      if (failure.kind === "not_verified") {
        setUnverifiedEmail(values.email)
      } else {
        setFormError(failure.message)
      }
      return
    }
    const target = isSafeRedirect(redirect) ? redirect : "/"
    navigate({ to: target })
  })

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return
    try {
      await ky.post("/api/v1/auth/request-verify-token", {
        json: { email: unverifiedEmail },
      })
      toast.success("Verification email sent — check your inbox.")
    } catch {
      toast.error("Could not resend the verification email.")
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Sign in to CivicPulse</CardTitle>
          <CardDescription>
            Use your email and password to access your campaign.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reset && (
            <Alert className="mb-4">
              <AlertTitle>Password updated</AlertTitle>
              <AlertDescription>
                Sign in with your new password.
              </AlertDescription>
            </Alert>
          )}
          {formError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {unverifiedEmail && (
            <Alert className="mb-4">
              <AlertTitle>Verify your email</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Check {unverifiedEmail} for a verification link before
                  signing in.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleResendVerification}
                >
                  Resend verification email
                </Button>
              </AlertDescription>
            </Alert>
          )}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Forgot?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!form.formState.errors.password}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Need an account?{" "}
            <Link to="/register" className="underline hover:text-foreground">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" ? search.redirect : undefined,
    reset:
      search.reset === true || search.reset === "1" || search.reset === 1
        ? true
        : undefined,
  }),
})
