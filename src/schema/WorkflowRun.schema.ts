import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

/*
One stored workflow run = one call to executeWorkflow().

executeWorkflow already builds the step list it returns to the client;
this schema just keeps that result so the activity feed and the run trace
on the AI review page have something to read after the request is over.
*/

const RunStepSchema = new Schema(
  {
    nodeId: String,

    name: String,

    function: String,

    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "skipped", "triggered"],
    },

    message: String,

    error: String,
  },
  { _id: false },
);

const WorkflowRunSchema = new Schema({
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

  githubRepoId: Number,

  repoFullName: String,

  prNumber: Number,

  // "pr_opened" | "pr_updated" | "manual_trigger" | "scheduled"
  trigger: String,

  workflowName: String,

  status: {
    type: String,
    enum: ["completed", "failed", "skipped"],
    required: true,
  },

  steps: {
    type: [RunStepSchema],
    default: [],
  },

  // Set when the run was skipped or failed, so the feed can explain why
  message: String,

  durationMs: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Activity feed — newest runs for this user
WorkflowRunSchema.index({ userId: 1, createdAt: -1 });

// Run history for one repository
WorkflowRunSchema.index({ repoId: 1, createdAt: -1 });

export type WorkflowRunType = InferSchemaType<typeof WorkflowRunSchema>;
export const WorkflowRunModel: Model<WorkflowRunType> =
  mongoose.models.WorkflowRun ||
  mongoose.model("WorkflowRun", WorkflowRunSchema);
