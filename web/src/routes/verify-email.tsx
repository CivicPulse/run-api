import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
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
import { toast } from "sonner"

type Status = "pending" | "success" | "error"

function VerifyEmailPage() {
  const { token } = Route.useSearch()
  const [status, setStatus] = useState<Status>("pending")
  const [error, setError] = useState<string | null>(null)
  const [resendEmail, setResendEmail] = useState("")
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setError("Missing verification token.")
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        await ky.post("/api/v1/auth/verify", {
          json: { token },
          credentials: "include",
        })
        if (!cancelled) setStatus("success")
      } catch (err) {
        if (cancelled) return
        let message = "Verification failed."
        if (err instanceof HTTPError) {
          try {
            const body = await err.response.clone().json()
            const detail = (body as { detail?: unknown }).detail
            if (typeof detail === "string") {
              if (detail === "VERIFY_USER_BAD_TOKEN") {
                message = "This verification link is invalid or has expired."
              } else if (detail === "VERIFY_USER_ALREADY_VERIFIED") {
                setStatus("success")
                return
              } else {
                message = detail
              }
            }
          } catch {
            // ignore
          }
        }
        setStatus("error")
        setError(message)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleResend = async () => {
    if (!resendEmail) return
    setResending(true)
    try {
      await ky.post("/api/v1/auth/request-verify-token", {
        json: { email: resendEmail },
        credentials: "include",
      })
      toast.success("If that email exists, we sent a new link.")
    } catch {
      toast.error("Could not resend — please try again.")
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {status === "pending" && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            )}
            {status === "success" && (
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
            {status === "error" && (
              <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
          </div>
          <CardTitle>
            {status === "pending" && "Verifying your email..."}
            {status === "success" && "Email verified"}
            {status === "error" && "Verification failed"}
          </CardTitle>
          <CardDescription>
            {status === "success" && "You can now sign in to your account."}
            {status === "error" &&
              "Request a new verification link below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "success" && (
            <Button asChild className="w-full">
              <Link to="/login" search={{ redirect: undefined, reset: undefined }}>Continue to sign in</Link>
            </Button>
          )}
          {status === "error" && (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="resend-email">Email</Label>
                <Input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={handleResend}
                className="w-full"
                disabled={resending || !resendEmail}
              >
                {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resend verification email
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" search={{ redirect: undefined, reset: undefined }} className="underline hover:text-foreground">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
})
