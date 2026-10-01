import { Request, Response } from "express";
import { WorkflowRunModel } from "../schema/WorkflowRun.schema";

/*
Feeds the "Run activity" timeline on the dashboard and the Runs tab.

Each entry is one workflow execution. The step list is summarised rather
than returned in full — the timeline only shows a headline and a meta
line, and the complete trace is already on the AI review page.
*/
export async function DashboardActivity(req: Request, res: Response) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const limit = Number(req.query.limit) || 15;

    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        message: "limit must be a number between 1 and 100",
        action: "failure",
      });
    }

    const runs = await WorkflowRunModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const activity = runs.map((run) => ({
      runId: run._id,
      repoId: run.repoId,
      githubRepoId: run.githubRepoId,
      repoFullName: run.repoFullName,
      prNumber: run.prNumber,
      workflowName: run.workflowName,
      trigger: run.trigger,
      status: run.status,
      message: run.message,
      durationMs: run.durationMs,
      stepCount: run.steps?.length || 0,
      failedStep:
        run.steps?.find((step) => step.status === "failed")?.name || null,
      createdAt: run.createdAt,
    }));

    return res.status(200).json({
      message: "Run activity fetched",
      action: "success",
      activity,
    });
  } catch (error) {
    console.error("DashboardActivity error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
