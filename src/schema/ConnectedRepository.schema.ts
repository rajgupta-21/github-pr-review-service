import mongoose from "mongoose";

const ConnectRepoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
      required: true,
    },

    repoId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    language: {
      type: String,
    },
    html_url: {
      type: String,
    },
    description: {
      type: String,
    },
    repoUrl: {
      type: String,
    },

    owner: {
      type: String,
      required: true,
    },
    webhookActive: {
      type: Boolean,
      default: false,
    },
    webhookId: {
      type: Number,
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "public",
    },
    fullName: {
      type: String,
      required: true,
    },
    defaultBranch: {
      type: String,
    },
    workflow: {
      nodes: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
      edges: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
      definition: {
        name: { type: String, default: "AI PR Automation Workflow" },
        status: {
          type: String,
          enum: ["draft", "active", "disabled"],
          default: "active",
        },
        steps: {
          type: [mongoose.Schema.Types.Mixed],
          default: [],
        },
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    connected: {
      type: Boolean,
      default: true,
    },
    /*
    Per-repository settings shown on the repository detail screen.
    */
    settings: {
      // Run the workflow automatically when a webhook arrives
      autoReview: {
        type: Boolean,
        default: true,
      },
      // Lowest severity that holds the merge. "none" disables the gate.
      mergeGate: {
        type: String,
        enum: ["none", "Critical", "High", "Medium", "Low"],
        default: "Critical",
      },
      // Paused repos keep their workflow but skip every run
      paused: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  },
);

ConnectRepoSchema.index(
  {
    userId: 1,
    repoId: 1,
  },
  {
    unique: true,
  },
);

export const ConnectedRepo = mongoose.model("ConnectedRepo", ConnectRepoSchema);
