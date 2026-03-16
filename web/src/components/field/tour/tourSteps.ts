import type { DriveStep } from "driver.js"

export const welcomeSteps: DriveStep[] = [
  {
    element: "[data-tour='hub-greeting']",
    popover: {
      title: "Welcome!",
      description:
        "This is your home base. You'll find all your assignments right here.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='assignment-card']",
    popover: {
      title: "Your Assignment",
      description:
        "Tap your assignment to get started. We'll walk you through everything!",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='help-button']",
    popover: {
      title: "Need Help?",
      description: "Tap here anytime to replay this walkthrough.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "[data-tour='avatar-menu']",
    popover: {
      title: "Your Account",
      description: "Manage your account and sign out from here.",
      side: "bottom",
      align: "end",
    },
  },
]

export const canvassingSteps: DriveStep[] = [
  {
    element: "[data-tour='household-card']",
    popover: {
      title: "Your First House",
      description:
        "Here's who lives here. Check the name and address before you knock.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='outcome-grid']",
    popover: {
      title: "Record the Result",
      description:
        "Tap a button after each door. Not home? Refused? Just tap and move on.",
      side: "top",
      align: "center",
    },
  },
  {
    element: "[data-tour='progress-bar']",
    popover: {
      title: "Track Your Progress",
      description:
        "See how far along you are. Your progress saves automatically.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='door-list-button']",
    popover: {
      title: "Jump to Any Door",
      description:
        "Open the list to skip ahead or revisit a previous door.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='skip-button']",
    popover: {
      title: "Skip a Door",
      description:
        "Can't reach this house? Skip it and come back later.",
      side: "top",
      align: "center",
    },
  },
]

export const phoneBankingSteps: DriveStep[] = [
  {
    element: "[data-tour='phone-number-list']",
    popover: {
      title: "Tap to Call",
      description:
        "Tap a phone number to open your dialer. Long-press to copy instead.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='outcome-grid']",
    popover: {
      title: "Record the Result",
      description:
        "Same as canvassing -- tap a button after each call.",
      side: "top",
      align: "center",
    },
  },
  {
    element: "[data-tour='end-session-button']",
    popover: {
      title: "End Your Session",
      description:
        "All done? Tap here to wrap up and see your results.",
      side: "top",
      align: "center",
    },
  },
]
