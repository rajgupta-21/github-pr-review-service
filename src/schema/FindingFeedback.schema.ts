import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

/*
What a human thought of a finding.

Without this the AI is presented as correct by construction: there is no
way to tell it it was wrong, and no way for us to learn that it was. The
first confidently wrong finding then leaves the user with two options —
ignore it, or stop trusting the tool.

Keyed by review and index because findings are embedded array entries with
no id of their own. That is stable for a given review, which is what
matters: feedback belongs to the finding as it was written, not to a
re-run that may word it differently.
*/

const FindingFeedbackSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Review",
    required: true,
  },

  // ConnectedRepo document id — lets us calibrate per repository
  repoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ConnectedRepo",
    required: true,
  },

  prNumber: Number,

  /** Position of the finding in the review's findings array. */
  findingIndex: {
    type: Number,
    required: true,
  },

  /*
  Copied from the finding so feedback stays meaningful even if the review
  is later deleted, and so we can count "how often is Critical on
  src/auth/* dismissed" without a join.
  */
  severity: String,
  file: String,
  issue: String,

  verdict: {
    type: String,
    enum: ["helpful", "not_helpful", "false_positive"],
    required: true,
  },

  // Required for false_positive — the reason is the useful part
  reason: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// One verdict per finding per user; a second submission replaces the first
FindingFeedbackSchema.index(
  { userId: 1, reviewId: 1, findingIndex: 1 },
  { unique: true },
);

// "What does this repository keep dismissing?" — the calibration question
FindingFeedbackSchema.index({ repoId: 1, verdict: 1, createdAt: -1 });

export type FindingFeedbackType = InferSchemaType<typeof FindingFeedbackSchema>;
export const FindingFeedbackModel: Model<FindingFeedbackType> =
  mongoose.models.FindingFeedback ||
  mongoose.model("FindingFeedback", FindingFeedbackSchema);
