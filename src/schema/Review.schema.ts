import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

/*
One stored AI review = one run of the reviewer against one PR.

We keep every run instead of overwriting, so the repository health trend
and the "last review" column have real history to read from.
*/

const FindingSchema = new Schema(
  {
    severity: {
      type: String,
      enum: ["Critical", "High", "Medium", "Low"],
      required: true,
    },

    file: String,

    line: Number,

    issue: String,

    reason: String,

    suggestion: String,
  },
  { _id: false },
);

const ReviewSchema = new Schema({
  // Who the review belongs to — every dashboard query starts here
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ConnectedRepo document id
  repoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ConnectedRepo",
    required: true,
  },

  // GitHub's own numeric repo id — lets us query without a join
  githubRepoId: {
    type: Number,
  },

  owner: String,

  repoName: String,

  prNumber: {
    type: Number,
    required: true,
  },

  prTitle: String,

  prAuthor: String,

  summary: String,

  recommendation: {
    type: String,
    enum: ["Approve", "Request Changes"],
  },

  /*
  Scores are stored 0-100.

  The model returns 0-10, so normalizeScore() in reviewStore.service.ts
  converts before saving. Live /pr/ai-review responses are untouched and
  stay 0-10 for the panel that already reads them.
  */
  overallScore: {
    type: Number,
    default: 0,
  },

  securityScore: {
    type: Number,
    default: 0,
  },

  performanceScore: {
    type: Number,
    default: 0,
  },

  qualityScore: {
    type: Number,
    default: 0,
  },

  findings: {
    type: [FindingSchema],
    default: [],
  },

  // Denormalised counts so the list screens never have to unwind findings
  criticalCount: {
    type: Number,
    default: 0,
  },

  highCount: {
    type: Number,
    default: 0,
  },

  mediumCount: {
    type: Number,
    default: 0,
  },

  lowCount: {
    type: Number,
    default: 0,
  },

  strengths: {
    type: [String],
    default: [],
  },

  /*
  Which model produced this review. A team deciding whether to trust this
  in their pipeline reasonably wants to know, and it also tells us which
  model a disputed finding came from after we change the default.
  */
  model: String,

  // "manual" when a user pressed Review, otherwise the workflow trigger
  trigger: {
    type: String,
    default: "manual",
  },

  // How long the review took, in milliseconds
  durationMs: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Newest review for a PR — used by GET /pr/review
ReviewSchema.index({ userId: 1, repoId: 1, prNumber: 1, createdAt: -1 });

// Dashboard windows ("last 30 days for this user")
ReviewSchema.index({ userId: 1, createdAt: -1 });

export type ReviewType = InferSchemaType<typeof ReviewSchema>;
export const ReviewModel: Model<ReviewType> =
  mongoose.models.Review || mongoose.model("Review", ReviewSchema);
