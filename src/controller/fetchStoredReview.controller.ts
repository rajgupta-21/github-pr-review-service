import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { WorkflowRunModel } from "../schema/WorkflowRun.schema";

/*
Feeds the AI review report page.

POST /pr/ai-review runs the model and costs money every time; this is the
read path for a review that already exists, so opening the report page
does not re-run anything. 404 means "no review yet" — the page shows its
Run review state and calls the POST route.
*/
export async function FetchStoredReview(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    // Express hands params back loosely typed — normalise once, up front
    const owner = String(req.params.owner || "");
    const repo = String(req.params.repo || "");
    const prNumber = String(req.params.prNumber || "");

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    if (!owner || !repo || !prNumber) {
      return res.status(400).json({
        message: "Missing required parameters: owner, repo, prNumber",
        action: "credentials missing",
      });
    }

    const parsedPrNumber = Number(prNumber);

    if (Number.isNaN(parsedPrNumber) || parsedPrNumber < 1) {
      return res.status(400).json({
        message: "prNumber must be a valid number",
        action: "failure",
      });
    }

    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      owner,
      name: repo,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected. Please connect it first",
        action: "repo not connected",
      });
    }

    const newest = await ReviewModel.findOne({
      userId,
      repoId: connectedRepo._id,
      prNumber: parsedPrNumber,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!newest) {
      return res.status(404).json({
        message: "No review stored for this pull request yet",
        action: "not reviewed",
      });
    }

    /*
    A workflow run executes several passes — security scan, code review,
    performance — and each stores its own review. Returning only the newest
    meant returning whichever pass finished last, which is often the one
    that found nothing, hiding the findings of the others.

    Passes of one run share a runId, so they are combined here into the
    single review the user thinks of. A hand-started review has no runId
    and stands alone.
    */
    const passes = newest.runId
      ? await ReviewModel.find({
          userId,
          repoId: connectedRepo._id,
          prNumber: parsedPrNumber,
          runId: newest.runId,
        })
          .sort({ createdAt: 1 })
          .lean()
      : [newest];

    const findings = passes.flatMap((pass) => pass.findings ?? []);
    const strengths = [...new Set(passes.flatMap((pass) => pass.strengths ?? []))];

    const countAt = (severity: string) =>
      findings.filter((finding) => finding.severity === severity).length;

    /*
    Scores are averaged across the passes that produced them. A pass that
    did not look at security should not drag the security score to zero,
    so only non-zero contributions count.
    */
    const averageOf = (key: "overallScore" | "securityScore" | "performanceScore" | "qualityScore") => {
      const values = passes.map((pass) => pass[key] ?? 0).filter((value) => value > 0);
      if (values.length === 0) return 0;
      return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
    };

    const review = {
      ...newest,
      findings,
      strengths,
      // The summary of the pass that actually found something reads best
      summary:
        passes.find((pass) => (pass.findings?.length ?? 0) > 0)?.summary ?? newest.summary,
      overallScore: averageOf("overallScore"),
      securityScore: averageOf("securityScore"),
      performanceScore: averageOf("performanceScore"),
      qualityScore: averageOf("qualityScore"),
      criticalCount: countAt("Critical"),
      highCount: countAt("High"),
      mediumCount: countAt("Medium"),
      lowCount: countAt("Low"),
      // "Request Changes" from any pass wins — one blocker is enough
      recommendation: passes.some((pass) => pass.recommendation === "Request Changes")
        ? "Request Changes"
        : "Approve",
      durationMs: passes.reduce((total, pass) => total + (pass.durationMs ?? 0), 0),
    };

    /*
    The run that produced this review, for the trace panel beside it.
    Matched on the PR rather than the review id because a run can produce
    several reviews (security scan, then code review).
    */
    const run = await WorkflowRunModel.findOne({
      userId,
      repoId: connectedRepo._id,
      prNumber: parsedPrNumber,
    })
      .sort({ createdAt: -1 })
      .lean();

    /*
    Which files the findings sit in — drives the distribution bars on the
    report's right-hand rail.
    */
    const findingsByFile = new Map<string, number>();

    for (const finding of review.findings || []) {
      const file = finding.file || "unknown";
      findingsByFile.set(file, (findingsByFile.get(file) || 0) + 1);
    }

    const fileDistribution = [...findingsByFile.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({
      message: "Stored review fetched",
      action: "success",
      review: {
        ...review,
        // Severity totals the filter chips count from
        counts: {
          total: review.findings?.length || 0,
          critical: review.criticalCount,
          high: review.highCount,
          medium: review.mediumCount,
          low: review.lowCount,
        },
        fileDistribution,
      },
      run: run
        ? {
            runId: run._id,
            trigger: run.trigger,
            status: run.status,
            steps: run.steps,
            durationMs: run.durationMs,
            createdAt: run.createdAt,
          }
        : null,
      // What the merge gate is set to, so the page can explain a held merge
      mergeGate: connectedRepo.settings?.mergeGate || "Critical",
      // Named on screen so a team can judge whether to trust it
      model: review.model ?? null,
      // How many review passes were combined into this view
      passCount: passes.length,
    });
  } catch (error) {
    console.error("FetchStoredReview error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
