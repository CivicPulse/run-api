import { useBlocker } from "@tanstack/react-router"
import type { UseFormReturn, FieldValues } from "react-hook-form"

interface UseFormGuardOptions {
  form: UseFormReturn<FieldValues>
}

export function useFormGuard({ form }: UseFormGuardOptions) {
  // Read through the Proxy by accessing formState.isDirty (not destructuring early)
  const isDirty = form.formState.isDirty

  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
    enableBeforeUnload: () => isDirty,
  })

  return {
    isDirty,
    isBlocked: status === "blocked",
    proceed: proceed!,
    reset: reset!,
  }
}
