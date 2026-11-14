/**
 * The feedback machine (`FEEDBACK_MS`, `feedbackFor`, `createActionFeedback`, shared operation
 * status), re-exported from `@zodal/ui` (0.2.6 and later), so every renderer and app uses the one
 * source of truth. This used to be a local copy while the `@zodal/ui` on npm predated it.
 * The decision: i2mint/zodal `docs/adr/0001-feedback-principle.md`.
 */

export {
  FEEDBACK_MS,
  feedbackFor,
  createActionFeedback,
  isCommandFailure,
  createOperationStatus,
  operationKey,
} from '@zodal/ui';
export type {
  FeedbackLevel,
  ActionStatus,
  ActionFeedbackState,
  ActionFeedbackOptions,
  ActionFeedback,
  FeedbackClock,
  OperationStatusSource,
} from '@zodal/ui';
