import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { WorkflowRunModel } from "../schema/WorkflowRun.schema";

/*
The Runs tab in the workflow builder.

Unlike the dashboard activity feed this returns the full step list — the
Runs tab is where you open a run and read what each node did.
*/
export async function WorkflowRuns(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const rawRepoId = req.query.repoId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const repoId = rawRepoId !== undefined ? Number(rawRepoId) : NaN;

    if (rawRepoId === undefined || Number.isNaN(repoId)) {
      return res.status(400).json({
        message:
          "repoId query parameter is required and must be a valid number",
        action: "failure",
      });
    }

    const limit = Number(req.query.limit) || 20;

    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        message: "limit must be a number between 1 and 100",
        action: "failure",
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

    const runs = await WorkflowRunModel.find({
      userId,
      repoId: connectedRepo._id,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      message: "Workflow runs fetched",
      action: "success",
      // Headline counts for the tab, taken from the page we just loaded
      summary: {
        total: runs.length,
        completed: runs.filter((run) => run.status === "completed").length,
        failed: runs.filter((run) => run.status === "failed").length,
        skipped: runs.filter((run) => run.status === "skipped").length,
      },
      runs,
    });
  } catch (error) {
    console.error("WorkflowRuns error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
