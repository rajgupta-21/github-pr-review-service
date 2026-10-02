import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { collapseRunPasses } from "../services/reviewStore.service";

/*
Feeds the repositories table — one row per connected repo with the
columns the screen shows: open PRs, health, workflow state, last review.

/repo/connected still returns the raw documents and is left alone; this
route is the enriched version the table needs, so neither screen has to
make N requests to fill a column.
*/
export async function RepoOverview(req: Request, res: Response) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const connectedRepos = await ConnectedRepo.find({ userId }).lean();

    if (connectedRepos.length === 0) {
      return res.status(200).json({
        message: "No repositories connected yet",
        action: "success",
        repositories: [],
      });
    }

    /*
    Pull every review for these repos once, then group in memory. One
    query beats one-per-repo, and the volume here is small.
    */
    const repoDocIds = connectedRepos.map((repo) => repo._id);

    const reviews = await ReviewModel.find({
      userId,
      repoId: { $in: repoDocIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    const reviewsByRepo = new Map<string, typeof reviews>();

    for (const review of reviews) {
      const key = String(review.repoId);

      if (!reviewsByRepo.has(key)) {
        reviewsByRepo.set(key, []);
      }

      reviewsByRepo.get(key)!.push(review);
    }

    const repositories = connectedRepos.map((repo) => {
      // Already sorted newest first by the query above
      const repoReviews = reviewsByRepo.get(String(repo._id)) || [];
      const lastReview = repoReviews[0];

      /*
      Health is the newest review score per PR, averaged. Using the newest
      per PR means fixing a finding lifts the number instead of leaving the
      bad run in the average forever.
      */
      // Merge each PR's run passes so totals match the PR screen
      const latest = collapseRunPasses(repoReviews);

      const health =
        latest.length > 0
          ? Math.round(
              latest.reduce((total, r) => total + (r.overallScore || 0), 0) /
                latest.length,
            )
          : null;

      const openFindings = latest.reduce(
        (totals, review) => ({
          critical: totals.critical + (review.criticalCount || 0),
          high: totals.high + (review.highCount || 0),
          medium: totals.medium + (review.mediumCount || 0),
          low: totals.low + (review.lowCount || 0),
        }),
        { critical: 0, high: 0, medium: 0, low: 0 },
      );

      const workflowNodeCount = repo.workflow?.nodes?.length || 0;

      /*
      The three states the Workflow column renders: no workflow built yet,
      built but paused, or live.
      */
      const workflowStatus =
        workflowNodeCount === 0
          ? "none"
          : repo.settings?.paused
            ? "paused"
            : "active";

      return {
        repoId: repo.repoId,
        repoDocId: repo._id,
        name: repo.name,
        fullName: repo.fullName,
        owner: repo.owner,
        description: repo.description,
        language: repo.language,
        visibility: repo.visibility,
        defaultBranch: repo.defaultBranch,
        connected: repo.connected,
        webhookActive: repo.webhookActive,
        /*
        A registered hook is not the same as a working one. The screen
        shows "waiting for first delivery" until something actually
        arrives, instead of claiming the repository is covered.
        */
        lastWebhookDeliveryAt: repo.lastWebhookDeliveryAt ?? null,
        lastWebhookEvent: repo.lastWebhookEvent ?? null,
        settings: repo.settings,
        // How many PRs this repo has a review on — the "Open PRs" column
        reviewedPrCount: latest.length,
        openFindings,
        health,
        workflow: {
          name: repo.workflow?.definition?.name || null,
          status: workflowStatus,
          nodeCount: workflowNodeCount,
        },
        lastReview: lastReview
          ? {
              prNumber: lastReview.prNumber,
              overallScore: lastReview.overallScore,
              trigger: lastReview.trigger,
              reviewedAt: lastReview.createdAt,
            }
          : null,
      };
    });

    return res.status(200).json({
      message: "Repository overview fetched",
      action: "success",
      repositories,
    });
  } catch (error) {
    console.error("RepoOverview error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
