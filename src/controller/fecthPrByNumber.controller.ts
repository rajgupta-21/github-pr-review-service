import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { PrModel } from "../schema/Pr.schema";
import { UserModel } from "../schema/user.schema";
import { getOctokit } from "../services/octokit.service";
import { getUserGithubToken } from "../services/userToken.service";
import { isSameUser } from "../utils/ownership.util";

export async function FetchPrByNo(req: Request, res: Response) {
  try {
    // validate(prSchemas.byNumber) coerces prNumber to a number
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const userId = String(req.params.userId);
    const prNumber = Number(req.params.prNumber);

    if (!prNumber || !userId || !owner || !repo) {
      return res.status(400).json({
        message: "Missing required parameters: prNumber, userId, owner, repo",
        action: "credentials missing",
      });
    }

    // The URL keeps userId so existing frontend calls work unchanged, but
    // it has to be the caller's own id — authMiddleware set req.user.
    if (!isSameUser(req, String(userId))) {
      return res.status(403).json({
        message: "You can only access your own pull requests",
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

    // Fetch PR from GitHub API
    const PullRequest = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    if (!PullRequest) {
      return res.status(404).json({
        message: "PR not found on GitHub",
        action: "failure",
      });
    }

    const githubPr = PullRequest.data;

    // Find the connected repository to get repoId
    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      owner,
      name: repo,
    });

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected. Please connect it first",
        action: "repo not connected",
      });
    }

    const existingPr = await PrModel.findOne({
      repoId: connectedRepo._id,
      githubPrNumber: prNumber,
    }).lean();

    // Map GitHub PR response to schema fields
    const prData = {
      repoId: connectedRepo._id,
      githubPrId: githubPr.id,
      githubPrNumber: githubPr.number,
      title: githubPr.title,
      body: githubPr.body,
      state: githubPr.state,
      merged: githubPr.merged,
      draft: githubPr.draft,
      author: {
        login: githubPr.user?.login,
        id: githubPr.user?.id,
        avatarUrl: githubPr.user?.avatar_url,
      },
      sourceBranch: githubPr.head?.ref,
      targetBranch: githubPr.base?.ref,
      headSha: githubPr.head?.sha,
      baseSha: githubPr.base?.sha,
      githubUrl: githubPr.html_url,
      diffUrl: githubPr.diff_url,
      patchUrl: githubPr.patch_url,
      commits: githubPr.commits,
      additions: githubPr.additions,
      deletions: githubPr.deletions,
      changedFiles: githubPr.changed_files,
      createdAtGithub: githubPr.created_at,
      updatedAtGithub: githubPr.updated_at,
      closedAtGithub: githubPr.closed_at,
      mergedAtGithub: githubPr.merged_at,
    };

    let savedPr;
    if (existingPr) {
      savedPr = await PrModel.findByIdAndUpdate(existingPr._id, prData, {
        returnDocument: "after",
      });
      return res.status(200).json({
        message: "PR updated successfully",
        pr: savedPr,
        action: "updated",
      });
    } else {
      savedPr = await PrModel.create(prData);
      return res.status(201).json({
        message: "PR created and stored successfully",
        pr: savedPr,
        action: "created",
      });
    }
  } catch (error) {
    console.error("FetchPrByNo error:", error);
    res.status(500).json({
      message: "Something went wrong. Please try again",
      action: "server failure",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
}
