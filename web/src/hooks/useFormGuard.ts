import { useBlocker } from "@tanstack/react-router"
import type { UseFormReturn } from "react-hook-form"

interface UseFormGuardOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any, any, any>
}

export function useFormGuard({ form }: UseFormGuardOptions) {
  // Read through the Proxy so React Hook Form tracks the subscription
  const isDirty = form.formState.isDirty

  const { status, proceed, reset } = useBlocker({
    // Read through the proxy at navigation time so form.reset() in submit
    // handlers is reflected immediately, even before re-render.
    shouldBlockFn: () => form.formState.isDirty,
    withResolver: true,
    enableBeforeUnload: () => form.formState.isDirty,
  })

  return {
    isDirty,
    isBlocked: status === "blocked",
    proceed: proceed!,
    reset: reset!,
  }
}
