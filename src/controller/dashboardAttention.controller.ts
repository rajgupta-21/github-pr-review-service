import { Request, Response } from "express";
import { ReviewModel } from "../schema/Review.schema";
import { collapseRunPasses } from "../services/reviewStore.service";

/*
Feeds the "Needs your attention" list on the dashboard.

A pull request lands here when its most recent review raised something
Critical or High. Everything else cleared on its own and is reported as a
count only, so the list stays short enough to act on.
*/
export async function DashboardAttention(req: Request, res: Response) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const limit = Number(req.query.limit) || 10;

    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({
        message: "limit must be a number between 1 and 50",
        action: "failure",
      });
    }

    /*
    Newest first, so the first review we see for a PR is its latest one.
    We only look at the last 30 days — older PRs are not what this list is for.
    */
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const reviews = await ReviewModel.find({
      userId,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Merge the passes of each PR's most recent run — see collapseRunPasses
    const latest = collapseRunPasses(reviews);

    const blocked = latest.filter(
      (r) => (r.criticalCount || 0) > 0 || (r.highCount || 0) > 0,
    );

    /*
    Critical first, then High, then the lower score — the order a reviewer
    would work through them.
    */
    blocked.sort((a, b) => {
      if ((b.criticalCount || 0) !== (a.criticalCount || 0)) {
        return (b.criticalCount || 0) - (a.criticalCount || 0);
      }
      if ((b.highCount || 0) !== (a.highCount || 0)) {
        return (b.highCount || 0) - (a.highCount || 0);
      }
      return (a.overallScore || 0) - (b.overallScore || 0);
    });

    const pullRequests = blocked.slice(0, limit).map((review) => ({
      reviewId: review._id,
      repoId: review.repoId,
      githubRepoId: review.githubRepoId,
      owner: review.owner,
      repoName: review.repoName,
      fullName: `${review.owner}/${review.repoName}`,
      prNumber: review.prNumber,
      title: review.prTitle,
      author: review.prAuthor,
      overallScore: review.overallScore,
      recommendation: review.recommendation,
      criticalCount: review.criticalCount,
      highCount: review.highCount,
      mediumCount: review.mediumCount,
      lowCount: review.lowCount,
      reviewedAt: review.createdAt,
    }));

    return res.status(200).json({
      message: "Pull requests needing attention fetched",
      action: "success",
      blockedCount: blocked.length,
      // Shown as "N more reviewed clean and merged without you"
      clearedCount: latest.length - blocked.length,
      pullRequests,
    });
  } catch (error) {
    console.error("DashboardAttention error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
