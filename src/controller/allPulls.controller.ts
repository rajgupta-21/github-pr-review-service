import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { PrModel } from "../schema/Pr.schema";

/*
Every pull request across every connected repository, in one request.

There was no cross-repo view at all: to see what was waiting on you, you
opened each repository in turn, or went to GitHub's notifications. This
reads from the PRs already stored locally rather than calling GitHub once
per repository, so it stays fast as the account grows.
*/
export async function AllPulls(req: Request, res: Response) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const repos = await ConnectedRepo.find({ userId, connected: true }).lean();

    if (repos.length === 0) {
      return res.status(200).json({
        message: "No repositories connected yet",
        action: "success",
        pullRequests: [],
      });
    }

    const repoDocIds = repos.map((repo) => repo._id);
    const repoByDocId = new Map(repos.map((repo) => [String(repo._id), repo]));

    const [pulls, reviews] = await Promise.all([
      PrModel.find({ repoId: { $in: repoDocIds } })
        .sort({ updatedAtGithub: -1 })
        .limit(500)
        .lean(),
      ReviewModel.find({ userId, repoId: { $in: repoDocIds } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // Newest review per repo+PR
    const latestReview = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      const key = `${review.repoId}#${review.prNumber}`;
      if (!latestReview.has(key)) latestReview.set(key, review);
    }

    const pullRequests = pulls.map((pr) => {
      const repo = repoByDocId.get(String(pr.repoId));
      const review = latestReview.get(`${pr.repoId}#${pr.githubPrNumber}`);

      return {
        id: String(pr._id),
        prNumber: pr.githubPrNumber,
        title: pr.title,
        state: pr.mergedAtGithub ? "merged" : pr.state,
        draft: pr.draft ?? false,
        author: pr.author?.login ?? null,
        avatarUrl: pr.author?.avatarUrl ?? null,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        updatedAt: pr.updatedAtGithub,
        createdAt: pr.createdAtGithub,
        repo: repo
          ? {
              repoId: repo.repoId,
              name: repo.name,
              fullName: repo.fullName,
              language: repo.language ?? null,
            }
          : null,
        review: review
          ? {
              reviewId: String(review._id),
              overallScore: review.overallScore,
              criticalCount: review.criticalCount,
              highCount: review.highCount,
              mediumCount: review.mediumCount,
              lowCount: review.lowCount,
              recommendation: review.recommendation,
              reviewedAt: review.createdAt,
            }
          : null,
        // Does the repo's own gate hold this one?
        blocked: review
          ? (review.criticalCount || 0) > 0 || (review.highCount || 0) > 0
          : false,
      };
    });

    return res.status(200).json({
      message: "Pull requests fetched",
      action: "success",
      // Facets so the client can build filters without scanning twice
      authors: [...new Set(pullRequests.map((pr) => pr.author).filter(Boolean))].sort(),
      repositories: repos.map((repo) => ({
        repoId: repo.repoId,
        fullName: repo.fullName,
      })),
      pullRequests,
    });
  } catch (error) {
    console.error("AllPulls error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
