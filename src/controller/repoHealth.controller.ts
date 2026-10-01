import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";

/*
Feeds the health sparkline and the "where the findings are" panel on the
repository detail screen.

Returns one point per day for the requested window, plus a per-file
finding breakdown so the panel does not need a second request.
*/
export async function RepoHealth(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const repoId = String(req.params.repoId || "");

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const parsedRepoId = Number(repoId);

    if (Number.isNaN(parsedRepoId)) {
      return res.status(400).json({
        message: "repoId must be a valid number",
        action: "failure",
      });
    }

    const days = Number(req.query.days) || 30;

    if (Number.isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        message: "days must be a number between 1 and 365",
        action: "failure",
      });
    }

    // Scoped to this user so one account cannot read another's history
    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      repoId: parsedRepoId,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const reviews = await ReviewModel.find({
      userId,
      repoId: connectedRepo._id,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: 1 })
      .lean();

    /*
    Group by calendar day and average the scores in each — a day with four
    reviews should be one point on the line, not four.
    */
    const scoresByDay = new Map<string, number[]>();

    for (const review of reviews) {
      const day = new Date(review.createdAt).toISOString().slice(0, 10);

      if (!scoresByDay.has(day)) {
        scoresByDay.set(day, []);
      }

      scoresByDay.get(day)!.push(review.overallScore || 0);
    }

    const trend = [...scoresByDay.entries()].map(([date, scores]) => ({
      date,
      score: Math.round(
        scores.reduce((total, score) => total + score, 0) / scores.length,
      ),
      reviewCount: scores.length,
    }));

    const firstPoint = trend[0];
    const lastPoint = trend[trend.length - 1];

    /*
    Which files the findings cluster in — drives the "9 of the last 14
    findings sit in src/auth/" line on the screen.
    */
    const findingsByFile = new Map<
      string,
      { critical: number; high: number; medium: number; low: number }
    >();

    for (const review of reviews) {
      for (const finding of review.findings || []) {
        const file = finding.file || "unknown";

        if (!findingsByFile.has(file)) {
          findingsByFile.set(file, {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          });
        }

        const counts = findingsByFile.get(file)!;

        if (finding.severity === "Critical") counts.critical += 1;
        else if (finding.severity === "High") counts.high += 1;
        else if (finding.severity === "Medium") counts.medium += 1;
        else counts.low += 1;
      }
    }

    const files = [...findingsByFile.entries()]
      .map(([file, counts]) => ({
        file,
        ...counts,
        total: counts.critical + counts.high + counts.medium + counts.low,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // First and last point of the window — the "−11 this month" figure
    const change =
      firstPoint && lastPoint && trend.length > 1
        ? lastPoint.score - firstPoint.score
        : 0;

    return res.status(200).json({
      message: "Repository health fetched",
      action: "success",
      windowDays: days,
      currentScore: lastPoint ? lastPoint.score : null,
      change,
      trend,
      files,
    });
  } catch (error) {
    console.error("RepoHealth error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
