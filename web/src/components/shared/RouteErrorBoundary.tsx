import { useRouter } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface RouteErrorProps {
  error: Error
  reset: () => void
}

export function RouteErrorBoundary({ error, reset }: RouteErrorProps) {
  const router = useRouter()

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          {import.meta.env.DEV && error?.message && (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-left text-xs">
              {error.message}
            </pre>
          )}
          <div className="flex justify-center gap-3">
            <Button variant="default" onClick={() => reset()}>
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => router.navigate({ to: "/" })}
            >
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
