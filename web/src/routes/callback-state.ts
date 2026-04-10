// Module-level flag prevents signinRedirectCallback() from being called
// more than once. This is critical because:
// 1. React StrictMode unmounts/remounts components, re-triggering effects
// 2. Auth state changes can cause parent re-renders that remount this component
// The flag must NOT have a cleanup/reset — each login cycle involves a full
// page navigation through the OIDC provider, which reloads this module fresh.
let callbackProcessed = false

export function hasCallbackProcessed() {
  return callbackProcessed
}

export function markCallbackProcessed() {
  callbackProcessed = true
}

export function __resetCallbackProcessedForTests() {
  callbackProcessed = false
}
