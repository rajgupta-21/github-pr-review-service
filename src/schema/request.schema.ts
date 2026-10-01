import { z } from "zod";

/*
Request shapes, in one file so the rules are visible together rather than
scattered through controllers as ad-hoc `if (!x)` checks.
*/

/* ─── shared pieces ──────────────────────────────────────────── */

// Route params arrive as strings; coerce so controllers get numbers.
export const numericId = z.coerce
  .number()
  .int()
  .positive("must be a positive number");

// GitHub's own rules: 1-39 chars, alphanumeric and hyphens.
const githubOwner = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9-]+$/, "invalid GitHub owner");

// Repository names also allow dots and underscores.
const githubRepoName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "invalid repository name");

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "invalid id");

/* ─── auth ───────────────────────────────────────────────────── */

/*
Password policy. There was none — a single character was accepted.
Length is the rule that actually matters; composition rules push people
toward predictable substitutions, so the floor is 10 characters with a
ceiling that stops bcrypt's 72-byte truncation surprising anyone.
*/
const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(72, "Password must be at most 72 characters");

export const authSchemas = {
  register: {
    body: z.object({
      name: z.string().trim().min(1, "Name is required").max(80),
      email: z.string().trim().toLowerCase().email("Enter a valid email"),
      password,
    }),
  },
  login: {
    body: z.object({
      email: z.string().trim().toLowerCase().email("Enter a valid email"),
      // Not the policy schema: old accounts may predate it, and telling a
      // signing-in user their password is "too short" leaks the policy.
      password: z.string().min(1, "Password is required"),
    }),
  },
};

/* ─── repositories ───────────────────────────────────────────── */

export const repoSchemas = {
  connect: {
    body: z.object({
      repoId: numericId,
      owner: githubOwner,
      fullName: z.string().min(1).max(140),
    }),
  },
  byRepoId: {
    params: z.object({ repoId: numericId }),
  },
  health: {
    params: z.object({ repoId: numericId }),
    query: z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  },
  settings: {
    params: z.object({ repoId: numericId }),
    body: z
      .object({
        autoReview: z.boolean().optional(),
        mergeGate: z
          .enum(["none", "Critical", "High", "Medium", "Low"])
          .optional(),
        paused: z.boolean().optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Send at least one of: autoReview, mergeGate, paused",
      ),
  },
};

/* ─── pull requests ──────────────────────────────────────────── */

const prLocator = z.object({
  owner: githubOwner,
  repo: githubRepoName,
});

export const prSchemas = {
  // Routes that still carry userId in the path for frontend compatibility
  listForRepo: {
    params: z.object({
      userName: githubOwner,
      repoName: githubRepoName,
      userId: mongoId,
    }),
  },
  byNumber: {
    params: prLocator.extend({
      prNumber: numericId,
      userId: mongoId,
    }),
  },
  filesChanged: {
    params: prLocator.extend({
      pull_number: numericId,
      userId: mongoId,
    }),
  },
  // Newer routes take the user from the session instead
  detail: {
    params: prLocator.extend({ pull_number: numericId }),
  },
  storedReview: {
    params: prLocator.extend({ prNumber: numericId }),
  },
  aiReview: {
    body: z.object({
      userId: mongoId,
      owner: githubOwner,
      repoName: githubRepoName,
      pr_Number: numericId,
      context: z.string().max(2000).optional(),
    }),
  },
};

/* ─── acting on a pull request ───────────────────────────────── */

const prActionParams = z.object({
  repoId: numericId,
  prNumber: numericId,
});

export const prActionSchemas = {
  comment: {
    params: prActionParams,
    body: z.object({
      body: z.string().trim().min(1, "Write something first").max(65536),
      // The finding being replied to, quoted into the comment
      quote: z.string().max(4000).optional(),
    }),
  },
  review: {
    params: prActionParams,
    body: z.object({
      event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
      body: z.string().max(65536).optional(),
    }),
  },
  merge: {
    params: prActionParams,
    body: z.object({
      method: z.enum(["merge", "squash", "rebase"]).default("merge"),
      // Proceed past a held merge gate, with a reason recorded on the PR
      override: z.boolean().optional(),
      overrideReason: z.string().max(2000).optional(),
    }),
  },
};

/* ─── finding feedback ───────────────────────────────────────── */

export const findingFeedbackSchemas = {
  submit: {
    params: z.object({
      reviewId: mongoId,
      findingIndex: z.coerce.number().int().min(0),
    }),
    body: z.object({
      verdict: z.enum(["helpful", "not_helpful", "false_positive"]),
      reason: z.string().trim().max(2000).optional(),
    }),
  },
  list: {
    params: z.object({ reviewId: mongoId }),
  },
};

/* ─── workflows ──────────────────────────────────────────────── */

/*
Nodes and edges are React Flow objects whose shape is owned by the
client. We check the parts the executor depends on and let the rest
through rather than mirroring a third-party type we do not control.
*/
const workflowNode = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

const workflowEdge = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .loose();

export const workflowSchemas = {
  get: {
    query: z.object({ repoId: numericId }),
  },
  save: {
    body: z.object({
      repoId: numericId,
      // A cap, so one request cannot store an unbounded document
      nodes: z.array(workflowNode).max(200),
      edges: z.array(workflowEdge).max(400),
      workflow: z.unknown().optional(),
    }),
  },
  execute: {
    body: z.object({
      repoId: numericId,
      prNumber: numericId,
      trigger: z.string().min(1).max(60).default("manual_trigger"),
      nodes: z.array(workflowNode).max(200).optional(),
      edges: z.array(workflowEdge).max(400).optional(),
    }),
  },
  enableWebhook: {
    body: z.object({ repoId: numericId }),
  },
  runs: {
    query: z.object({
      repoId: numericId,
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
};

/* ─── dashboard ──────────────────────────────────────────────── */

export const dashboardSchemas = {
  stats: {
    query: z.object({
      days: z.coerce.number().int().min(1).max(365).default(7),
    }),
  },
  attention: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }),
  },
  activity: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(15),
    }),
  },
};
