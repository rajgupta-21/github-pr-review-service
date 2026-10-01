import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";

const MERGE_GATE_VALUES = ["none", "Critical", "High", "Medium", "Low"];

/*
Updates the toggles on the repository settings panel: auto review,
merge gate severity, and whether the repo is paused.

Only the fields present in the body are changed, so the screen can send a
single toggle without having to resend the rest.
*/
export async function UpdateRepoSettings(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const repoId = String(req.params.repoId || "");
    const { autoReview, mergeGate, paused } = req.body;

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

    if (mergeGate !== undefined && !MERGE_GATE_VALUES.includes(mergeGate)) {
      return res.status(400).json({
        message: `mergeGate must be one of: ${MERGE_GATE_VALUES.join(", ")}`,
        action: "failure",
      });
    }

    if (autoReview !== undefined && typeof autoReview !== "boolean") {
      return res.status(400).json({
        message: "autoReview must be a boolean",
        action: "failure",
      });
    }

    if (paused !== undefined && typeof paused !== "boolean") {
      return res.status(400).json({
        message: "paused must be a boolean",
        action: "failure",
      });
    }

    // Build the update from whichever fields were actually sent
    const update: Record<string, boolean | string> = {};

    if (autoReview !== undefined) update["settings.autoReview"] = autoReview;
    if (mergeGate !== undefined) update["settings.mergeGate"] = mergeGate;
    if (paused !== undefined) update["settings.paused"] = paused;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        message: "Send at least one of: autoReview, mergeGate, paused",
        action: "failure",
      });
    }

    const connectedRepo = await ConnectedRepo.findOneAndUpdate(
      { userId, repoId: parsedRepoId },
      { $set: update },
      { returnDocument: "after", runValidators: true },
    )
      .select("repoId name fullName settings webhookActive")
      .lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    return res.status(200).json({
      message: "Repository settings updated",
      action: "success",
      repo: connectedRepo,
    });
  } catch (error) {
    console.error("UpdateRepoSettings error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
