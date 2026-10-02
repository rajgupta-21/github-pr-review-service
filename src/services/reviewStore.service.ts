import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { WorkflowRunModel } from "../schema/WorkflowRun.schema";
import { env } from "../config/env";
import type {
  ReviewResult,
  WorkflowExecutionResult,
} from "../types/workflow.types";

/*
Everything that writes review or run history lives here.

runAIReview() and executeWorkflow() both call into this file, so a review
is stored the same way whether it came from the Review button, a workflow
node, or a GitHub webhook.
*/

export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/*
The model is asked for scores 0-10 but does not always obey — it sometimes
answers 0-100. Anything above 10 is treated as already being on the 100
scale, everything else is multiplied up. Result is always 0-100.
*/
export function normalizeScore(value: unknown): number {
  const score = Number(value);

  if (Number.isNaN(score) || score < 0) return 0;
  if (score > 100) return 100;
  if (score > 10) return Math.round(score);

  return Math.round(score * 10);
}

/*
The model writes severity however it likes ("critical", "HIGH", "med").
Anything we cannot place becomes "Low" so it is still counted.
*/
export function normalizeSeverity(value: unknown): Severity {
  const text = String(value || "").trim().toLowerCase();

  const match = SEVERITIES.find((severity) => severity.toLowerCase() === text);

  return match || "Low";
}

/*
The model is asked for "Approve" or "Request Changes" but sometimes writes
a sentence. Anything mentioning "request" or "change" is treated as a
request for changes; anything else we cannot read falls back to Approve.
*/
export function normalizeRecommendation(
  value: unknown,
): "Approve" | "Request Changes" {
  const text = String(value || "").toLowerCase();

  if (text.includes("request") || text.includes("change")) {
    return "Request Changes";
  }

  return "Approve";
}

export function countBySeverity(findings: { severity: Severity }[]) {
  return {
    criticalCount: findings.filter((f) => f.severity === "Critical").length,
    highCount: findings.filter((f) => f.severity === "High").length,
    mediumCount: findings.filter((f) => f.severity === "Medium").length,
    lowCount: findings.filter((f) => f.severity === "Low").length,
  };
}

/*
Saves one AI review.

The caller only knows owner/repo as strings, so we look the ConnectedRepo
up here. If the repo is not connected there is nothing to attach the
review to — we return null rather than throwing, because a failed save
must never break the review the user is waiting for.
*/
export async function saveReview(params: {
  userId: string;
  owner: string;
  repo: string;
  prNumber: number;
  review: ReviewResult;
  trigger?: string;
  durationMs?: number;
  prTitle?: string;
  prAuthor?: string;
  runId?: string;
}) {
  try {
    const {
      userId,
      owner,
      repo,
      prNumber,
      review,
      trigger = "manual",
      durationMs = 0,
      prTitle,
      prAuthor,
      runId,
    } = params;

    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      owner,
      name: repo,
    }).lean();

    if (!connectedRepo) {
      console.warn(
        `[reviewStore] ${owner}/${repo} is not connected — review not stored`,
      );
      return null;
    }

    const findings = (review.findings || []).map((finding) => ({
      severity: normalizeSeverity(finding.severity),
      file: finding.file,
      issue: finding.issue,
      reason: finding.reason,
      suggestion: finding.suggestion,
    }));

    const savedReview = await ReviewModel.create({
      userId,
      repoId: connectedRepo._id,
      githubRepoId: connectedRepo.repoId,
      owner,
      repoName: repo,
      prNumber,
      prTitle,
      prAuthor,
      summary: review.summary,
      recommendation: normalizeRecommendation(review.recommendation),
      overallScore: normalizeScore(review.overallScore),
      securityScore: normalizeScore(review.securityScore),
      performanceScore: normalizeScore(review.performanceScore),
      qualityScore: normalizeScore(review.qualityScore),
      findings,
      ...countBySeverity(findings),
      strengths: review.strengths || [],
      model: env.GROQ_MODEL,
      runId,
      trigger,
      durationMs,
    });

    return savedReview;
  } catch (error) {
    console.error("[reviewStore] Failed to store review:", error);
    return null;
  }
}

/*
Saves one workflow execution.

Same rule as saveReview — a storage failure is logged, never thrown, so a
successful run is still reported to the caller.
*/
export async function saveWorkflowRun(params: {
  userId: string;
  repoDocId: string;
  githubRepoId: number;
  repoFullName: string;
  workflowName?: string;
  result: WorkflowExecutionResult;
  durationMs?: number;
}) {
  try {
    const {
      userId,
      repoDocId,
      githubRepoId,
      repoFullName,
      workflowName,
      result,
      durationMs = 0,
    } = params;

    const savedRun = await WorkflowRunModel.create({
      userId,
      repoId: repoDocId,
      githubRepoId,
      repoFullName,
      prNumber: result.prNumber,
      trigger: result.trigger,
      workflowName: workflowName || "Workflow",
      status: result.status,
      steps: result.steps,
      message: result.message,
      durationMs,
    });

    return savedRun;
  } catch (error) {
    console.error("[reviewStore] Failed to store workflow run:", error);
    return null;
  }
}

/*
Collapsing review passes into the one review a user thinks of.

A workflow run executes several passes — security scan, code review,
performance — and each stores its own Review document. Any code that took
"the newest review for this PR" was therefore taking whichever pass
finished last, which is frequently the one that found nothing. That hid
real findings on the dashboard, the attention queue, the repository list
and the PR report alike.

Passes of one run share a runId. This folds them into a single logical
review per pull request, and every read path uses it so the numbers agree
wherever they appear.
*/

type ReviewLike = {
  repoId: unknown;
  prNumber: number;
  runId?: string | null;
  createdAt: Date;
  overallScore?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  findings?: unknown[];
  // Mongoose lean() types this as nullable
  recommendation?: string | null;
  durationMs?: number;
};

/**
 * Takes reviews sorted NEWEST FIRST and returns one merged review per pull
 * request, built from the most recent run's passes.
 */
export function collapseRunPasses<T extends ReviewLike>(reviews: T[]): T[] {
  const newestRun = new Map<string, string | null>();
  const merged = new Map<string, T & { passCount: number; _scores: number[] }>();

  for (const review of reviews) {
    const key = `${review.repoId}#${review.prNumber}`;

    if (!newestRun.has(key)) {
      newestRun.set(key, review.runId ?? null);
    }

    const runOfThisPr = newestRun.get(key);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...review,
        passCount: 1,
        _scores: (review.overallScore ?? 0) > 0 ? [review.overallScore!] : [],
      });
      continue;
    }

    // Only fold in passes from the same run; older runs are history
    const sameRun = runOfThisPr !== null && review.runId === runOfThisPr;
    if (!sameRun) continue;

    existing.criticalCount = (existing.criticalCount ?? 0) + (review.criticalCount ?? 0);
    existing.highCount = (existing.highCount ?? 0) + (review.highCount ?? 0);
    existing.mediumCount = (existing.mediumCount ?? 0) + (review.mediumCount ?? 0);
    existing.lowCount = (existing.lowCount ?? 0) + (review.lowCount ?? 0);
    existing.findings = [...(existing.findings ?? []), ...(review.findings ?? [])];
    existing.durationMs = (existing.durationMs ?? 0) + (review.durationMs ?? 0);
    existing.passCount += 1;

    // One pass asking for changes is enough to ask for changes
    if (review.recommendation === "Request Changes") {
      existing.recommendation = "Request Changes";
    }

    // Mean of the passes that actually scored
    if ((review.overallScore ?? 0) > 0) {
      existing._scores.push(review.overallScore!);
      existing.overallScore = Math.round(
        existing._scores.reduce((total, value) => total + value, 0) / existing._scores.length,
      );
    }
  }

  return [...merged.values()].map((entry) => {
    const { _scores, ...rest } = entry;
    return rest as unknown as T;
  });
}
