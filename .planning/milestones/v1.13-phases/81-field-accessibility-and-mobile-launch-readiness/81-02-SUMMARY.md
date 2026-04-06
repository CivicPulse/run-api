# 81-02 Summary

## Completed

- Updated volunteer post-login routing so users with volunteer scope prefer a campaign that actually has a live field assignment instead of blindly using the first campaign returned by `/api/v1/me/campaigns`.
- Preserved field-mode routing for mixed-role users who also have volunteer assignments.
- Raised the affected field-mode `Back to Hub` controls to the intended minimum touch-target height and applied matching minimum sizing to toast action/cancel buttons used by the resume prompt.

## Verification

- Callback route tests were extended to cover assignment-aware routing and mixed-role volunteer users.
- Field canvassing and phone-banking route tests passed after the touch-target changes.

