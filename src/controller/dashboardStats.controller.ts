import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { collapseRunPasses } from "../services/reviewStore.service";

/*
Feeds the four stat cards at the top of the dashboard.

?days=7 picks the window (7 / 30 / 90 — the toggle on the screen).
Each card also reports the previous window of the same length so the
frontend can show the "+18%" delta without a second request.
*/
export async function DashboardStats(req: Request, res: Response) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const days = Number(req.query.days) || 7;

    if (Number.isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        message: "days must be a number between 1 and 365",
        action: "failure",
      });
    }

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now - windowMs);
    const previousStart = new Date(now - windowMs * 2);

    // Current window and the one before it, so we can compare them
    const [current, previous] = await Promise.all([
      ReviewModel.find({ userId, createdAt: { $gte: windowStart } }).lean(),
      ReviewModel.find({
        userId,
        createdAt: { $gte: previousStart, $lt: windowStart },
      }).lean(),
    ]);

    const connectedRepoCount = await ConnectedRepo.countDocuments({
      userId,
      connected: true,
    });

    /*
    "PRs reviewed" counts distinct pull requests, not review runs — one PR
    re-reviewed three times is still one PR.
    */
    const countDistinctPrs = (reviews: typeof current) =>
      new Set(reviews.map((r) => `${r.repoId}#${r.prNumber}`)).size;

    const sumFindings = (reviews: typeof current) =>
      reviews.reduce((total, r) => total + (r.findings?.length || 0), 0);

    /*
    Median, not mean — one slow outlier should not move the headline number.
    */
    const medianDuration = (reviews: typeof current) => {
      const durations = reviews
        .map((r) => r.durationMs || 0)
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b);

      if (durations.length === 0) return 0;

      const middle = Math.floor(durations.length / 2);

      // Even-length lists average the two middle values
      if (durations.length % 2 === 0) {
        const lower = durations[middle - 1] ?? 0;
        const upper = durations[middle] ?? 0;
        return Math.round((lower + upper) / 2);
      }

      return durations[middle] ?? 0;
    };

    /*
    A PR counts as "clean" when its newest review raised nothing Critical
    or High — that is the same rule the merge gate uses.
    */
    const countClean = (reviews: typeof current) => {
      /*
      Sorted newest first so collapseRunPasses folds the right run. A PR is
      clean only when every pass of its latest run found nothing serious.
      */
      const sorted = [...reviews].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );

      return collapseRunPasses(sorted).filter(
        (r) => (r.criticalCount || 0) === 0 && (r.highCount || 0) === 0,
      ).length;
    };

    const prsReviewed = countDistinctPrs(current);
    const cleanPrs = countClean(current);

    return res.status(200).json({
      message: "Dashboard stats fetched",
      action: "success",
      windowDays: days,
      connectedRepos: connectedRepoCount,
      stats: {
        prsReviewed: {
          value: prsReviewed,
          previous: countDistinctPrs(previous),
        },
        findingsRaised: {
          value: sumFindings(current),
          previous: sumFindings(previous),
          // Severity split for the stacked bar under the card
          bySeverity: {
            critical: current.reduce((t, r) => t + (r.criticalCount || 0), 0),
            high: current.reduce((t, r) => t + (r.highCount || 0), 0),
            medium: current.reduce((t, r) => t + (r.mediumCount || 0), 0),
            low: current.reduce((t, r) => t + (r.lowCount || 0), 0),
          },
        },
        medianReviewMs: {
          value: medianDuration(current),
          previous: medianDuration(previous),
        },
        cleanPrs: {
          value: cleanPrs,
          previous: countClean(previous),
          // Share of reviewed PRs that passed with nothing serious
          percentage:
            prsReviewed > 0 ? Math.round((cleanPrs / prsReviewed) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error("DashboardStats error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
