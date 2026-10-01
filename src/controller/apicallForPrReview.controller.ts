import { Request, Response } from "express";
import { UserModel } from "../schema/user.schema";
import { getOctokit } from "../services/octokit.service";
import { runAIReview } from "../services/prContext.service";
import { getUserGithubToken } from "../services/userToken.service";
import { isSameUser } from "../utils/ownership.util";

export async function AiReviewForPR(req: Request, res: Response) {
  try {
    const { userId, owner, repoName, pr_Number, context } = req.body;

    if (!userId || !owner || !repoName || !pr_Number) {
      return res.status(400).json({
        message: "Missing credentials",
        action: "missing credentials",
      });
    }

    // The body still carries userId, but it has to be the caller's own id —
    // authMiddleware set req.user. Reviews cost a model call, so this also
    // stops one account spending another's quota.
    if (!isSameUser(req, userId)) {
      return res.status(403).json({
        message: "You can only review your own pull requests",
        action: "forbidden",
      });
    }

    const accessToken = await getUserGithubToken(String(userId));

    if (!accessToken) {
      return res.status(401).json({
        message: "GitHub account not connected. Please sign in with GitHub",
        action: "login required",
      });
    }

    const octokit = getOctokit(accessToken);

    const pullNumber = Number(pr_Number);

    if (Number.isNaN(pullNumber)) {
      return res.status(400).json({
        message: "Invalid PR Number",
        action: "failure",
      });
    }

    const review = await runAIReview(
      {
        userId: String(userId),
        owner,
        repo: repoName,
        repoId: 0,
        prNumber: pullNumber,
        octokit,
      },
      context,
      // Stored against the review so the activity feed can tell a hand-run
      // review apart from one a webhook started
      "manual",
    );

    return res.status(200).json({
      message: "AI review generated successfully",
      action: "success",
      review,
    });
  } catch (error) {
    console.error("AI Review Error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
