import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import ky, { HTTPError } from "ky"
import { AlertCircle, CheckCircle2, Loader2, Vote } from "lucide-react"
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

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  display_name: z.string().min(2, "Enter your name"),
  password: z.string().min(12, "Password must be at least 12 characters"),
})

type RegisterFormValues = z.infer<typeof registerSchema>

function RegisterPage() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", display_name: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await ky.post("/api/v1/auth/register", {
        json: values,
        credentials: "include",
      })
      setSubmitted(true)
    } catch (err) {
      if (err instanceof HTTPError) {
        let message = "Registration failed. Try again."
        try {
          const body = await err.response.clone().json()
          const detail = (body as { detail?: unknown }).detail
          if (typeof detail === "string") {
            message = detail
          } else if (
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
            if (code === "REGISTER_USER_ALREADY_EXISTS") {
              message = "An account with that email already exists."
            } else if (code === "REGISTER_INVALID_PASSWORD") {
              const reason = (detail as { reason?: string }).reason
              message = reason || "Choose a stronger password."
            }
          }
        } catch {
          // ignore parse failures
        }
        setServerError(message)
      } else {
        setServerError("Network error — please try again.")
      }
    }
  })

  if (submitted) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a verification link to your inbox. Click it to finish
              creating your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link to="/login" search={{ redirect: undefined, reset: undefined }}>Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Join CivicPulse — free for campaigns of any size.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not create account</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="display_name">Full name</Label>
              <Input
                id="display_name"
                autoComplete="name"
                autoFocus
                aria-invalid={!!form.formState.errors.display_name}
                {...form.register("display_name")}
              />
              {form.formState.errors.display_name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.display_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
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
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" search={{ redirect: undefined, reset: undefined }} className="underline hover:text-foreground">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/register")({
  component: RegisterPage,
})
