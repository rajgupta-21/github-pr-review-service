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
