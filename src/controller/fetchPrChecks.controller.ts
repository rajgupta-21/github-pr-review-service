import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { getOctokit } from "../services/octokit.service";

/*
The Checks panel on the PR review screen.

GitHub's own check runs for the head commit, plus one synthetic row for
our merge gate so the panel shows the same thing the gate banner does.
*/
export async function FetchPrChecks(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    // Express hands params back loosely typed — normalise once, up front
    const owner = String(req.params.owner || "");
    const repo = String(req.params.repo || "");
    const pull_number = String(req.params.pull_number || "");

    if (!owner || !repo || !pull_number) {
      return res.status(400).json({
        message: "Missing required parameters: owner, repo, pull_number",
        action: "credentials missing",
      });
    }

    /*
    getOctokit always returns a client, even with no token — so check the
    token itself. Without this the GitHub call throws and a user who simply
    has not connected GitHub gets a 500 instead of being told to sign in.
    */
    const accessToken = req.user?.githubAccessToken;

    if (!accessToken) {
      return res.status(401).json({
        message: "GitHub account not connected. Please sign in with GitHub",
        action: "login required",
      });
    }

    const octokit = getOctokit(accessToken);

    const prNumber = Number(pull_number);

    // Check runs hang off a commit, so we need the PR's head sha first
    const pullRequest = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const headSha = pullRequest.data.head.sha;

    const checkRuns = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      per_page: 100,
    });

    const checks = checkRuns.data.check_runs.map((check) => ({
      id: String(check.id),
      name: check.name,
      // queued | in_progress | completed
      status: check.status,
      // success | failure | neutral | cancelled | timed_out | action_required
      conclusion: check.conclusion,
      startedAt: check.started_at,
      completedAt: check.completed_at,
      // Milliseconds, so the panel can print "2m 04s" without parsing dates
      durationMs:
        check.started_at && check.completed_at
          ? new Date(check.completed_at).getTime() -
            new Date(check.started_at).getTime()
          : null,
      htmlUrl: check.html_url,
    }));

    /*
    Our own gate, derived from the newest stored review. It is not a real
    GitHub check run, so it is appended rather than fetched.
    */
    let mergeGateCheck = null;

    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      owner,
      name: repo,
    }).lean();

    if (connectedRepo) {
      const review = await ReviewModel.findOne({
        userId,
        repoId: connectedRepo._id,
        prNumber,
      })
        .sort({ createdAt: -1 })
        .lean();

      const gate = connectedRepo.settings?.mergeGate || "Critical";

      if (review && gate !== "none") {
        // Count everything at or above the configured severity
        const order = ["Low", "Medium", "High", "Critical"];
        const threshold = order.indexOf(gate);

        const blockingCount = (review.findings || []).filter(
          (finding) => order.indexOf(finding.severity) >= threshold,
        ).length;

        mergeGateCheck = {
          id: "mergegate",
          name: "Merge gate",
          status: "completed",
          conclusion: blockingCount > 0 ? "failure" : "success",
          startedAt: review.createdAt,
          completedAt: review.createdAt,
          durationMs: review.durationMs,
          htmlUrl: null,
          // Extra fields the banner uses to explain why the merge is held
          gate,
          blockingCount,
        };
      }
    }

    return res.status(200).json({
      message: "Successfully fetched checks",
      action: "success",
      headSha,
      checks: mergeGateCheck ? [...checks, mergeGateCheck] : checks,
    });
  } catch (error) {
    console.error("FetchPrChecks error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
