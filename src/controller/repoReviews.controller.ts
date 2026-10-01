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

    const latestByPr: Record<string, unknown> = {};

    for (const review of reviews) {
      const key = String(review.prNumber);

      if (latestByPr[key]) continue;

      latestByPr[key] = {
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
