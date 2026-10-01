import { Request, Response } from "express";
import { FindingFeedbackModel } from "../schema/FindingFeedback.schema";
import { ReviewModel } from "../schema/Review.schema";

/*
Recording a human verdict on a finding, and reporting back what those
verdicts add up to.

The point is not just to let users vent at a wrong finding — it is to make
the disagreement visible. A repository where half the Critical findings
get dismissed as false positives is telling us our severity calibration is
wrong for that codebase.
*/

export async function SubmitFindingFeedback(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const { reviewId, findingIndex } = req.params;
    const { verdict, reason } = req.body as {
      verdict: "helpful" | "not_helpful" | "false_positive";
      reason?: string;
    };

    const review = await ReviewModel.findOne({ _id: reviewId, userId }).lean();

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
        action: "not found",
      });
    }

    const index = Number(findingIndex);
    const finding = review.findings?.[index];

    if (!finding) {
      return res.status(404).json({
        message: "That finding is not part of this review",
        action: "not found",
      });
    }

    /*
    Calling it a false positive without saying why gives us nothing to
    calibrate against, so the reason is required for that verdict only.
    */
    if (verdict === "false_positive" && !reason?.trim()) {
      return res.status(400).json({
        message: "Tell us why this is wrong — that is what improves the next review",
        action: "validation failed",
      });
    }

    // Upsert: changing your mind replaces the previous verdict
    const feedback = await FindingFeedbackModel.findOneAndUpdate(
      { userId, reviewId, findingIndex: index },
      {
        userId,
        reviewId,
        repoId: review.repoId,
        prNumber: review.prNumber,
        findingIndex: index,
        severity: finding.severity,
        file: finding.file,
        issue: finding.issue,
        verdict,
        reason: reason?.trim(),
        createdAt: new Date(),
      },
      { upsert: true, returnDocument: "after" },
    ).lean();

    /*
    Tell the user what their verdict changed. "Thanks for the feedback" is
    a dead end; naming the effect is what makes it worth doing again.
    */
    const dismissedHere = await FindingFeedbackModel.countDocuments({
      repoId: review.repoId,
      verdict: "false_positive",
      severity: finding.severity,
    });

    return res.status(200).json({
      message:
        verdict === "false_positive"
          ? "Marked as a false positive"
          : verdict === "helpful"
            ? "Marked as helpful"
            : "Marked as not helpful",
      action: "success",
      feedback,
      // Surfaced as "3 of this repo's High findings have been dismissed"
      dismissedAtThisSeverity: dismissedHere,
    });
  } catch (error) {
    console.error("SubmitFindingFeedback error:", error);

    return res.status(500).json({
      message: "Could not record your feedback. Please try again",
      action: "server failure",
    });
  }
}

/** Every verdict this user has given on one review, keyed by finding index. */
export async function GetFindingFeedback(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const { reviewId } = req.params;

    const entries = await FindingFeedbackModel.find({ userId, reviewId }).lean();

    const byIndex: Record<string, { verdict: string; reason?: string }> = {};

    for (const entry of entries) {
      byIndex[String(entry.findingIndex)] = {
        verdict: entry.verdict,
        reason: entry.reason ?? undefined,
      };
    }

    return res.status(200).json({
      message: "Feedback fetched",
      action: "success",
      feedback: byIndex,
    });
  } catch (error) {
    console.error("GetFindingFeedback error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
