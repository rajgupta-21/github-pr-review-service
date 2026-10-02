import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";

/*
The latest review for every pull request in one repository.

The repository screen lists PRs and wants a score and finding counts
beside each one. Without this it either showed nothing, or the browser
had to ask for each PR separately. One query returns the lot, keyed by
PR number so the client can look up a row directly.
*/
export async function RepoReviews(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const repoId = Number(req.params.repoId);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      repoId,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    /*
    Newest first, so the first review seen for a PR is its latest. Cheaper
    than an aggregation pipeline at this volume and easier to follow.
    */
    const reviews = await ReviewModel.find({
      userId,
      repoId: connectedRepo._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    /*
    One run produces several review passes. Collapse them so a PR row shows
    the same totals as its report — otherwise the list could show 0 findings
    for a PR whose security pass found four.
    */
    const newestRunByPr = new Map<string, string | null>();
    const latestByPr: Record<string, any> = {};

    for (const review of reviews) {
      const key = String(review.prNumber);

      if (!newestRunByPr.has(key)) {
        newestRunByPr.set(key, review.runId ?? null);
      }

      const runOfThisPr = newestRunByPr.get(key);

      // Fold in later passes that belong to the same run
      if (latestByPr[key]) {
        const sameRun = runOfThisPr && review.runId === runOfThisPr;
        if (!sameRun) continue;

        const row = latestByPr[key];
        row.criticalCount += review.criticalCount ?? 0;
        row.highCount += review.highCount ?? 0;
        row.mediumCount += review.mediumCount ?? 0;
        row.lowCount += review.lowCount ?? 0;
        row.findingCount += review.findings?.length ?? 0;
        if (review.recommendation === "Request Changes") {
          row.recommendation = "Request Changes";
        }
        // Mean of the passes that actually scored
        if ((review.overallScore ?? 0) > 0) {
          row._scores.push(review.overallScore);
          row.overallScore = Math.round(
            row._scores.reduce((t: number, v: number) => t + v, 0) / row._scores.length,
          );
        }
        continue;
      }

      latestByPr[key] = {
        _scores: (review.overallScore ?? 0) > 0 ? [review.overallScore] : [],
        reviewId: review._id,
        prNumber: review.prNumber,
        overallScore: review.overallScore,
        securityScore: review.securityScore,
        performanceScore: review.performanceScore,
        qualityScore: review.qualityScore,
        recommendation: review.recommendation,
        criticalCount: review.criticalCount,
        highCount: review.highCount,
        mediumCount: review.mediumCount,
        lowCount: review.lowCount,
        findingCount: review.findings?.length || 0,
        trigger: review.trigger,
        reviewedAt: review.createdAt,
      };
    }

    // Drop the working field before sending
    for (const row of Object.values(latestByPr)) delete (row as any)._scores;

    return res.status(200).json({
      message: "Repository reviews fetched",
      action: "success",
      // Keyed by PR number so a list row is a direct lookup
      reviews: latestByPr,
      // What the merge gate blocks on, so the list can mark held PRs
      mergeGate: connectedRepo.settings?.mergeGate || "Critical",
    });
  } catch (error) {
    console.error("RepoReviews error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
