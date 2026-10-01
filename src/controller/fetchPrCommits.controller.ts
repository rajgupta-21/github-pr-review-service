import { Request, Response } from "express";
import { getOctokit } from "../services/octokit.service";

/*
Commits on a pull request — the Commits tab on the PR review screen,
which currently renders a hardcoded DUMMY_COMMITS array.

Straight GitHub passthrough, trimmed to the fields the tab shows so the
page is not handed the full octokit payload.
*/
export async function FetchPrCommits(req: Request, res: Response) {
  try {
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

    // authMiddleware put the user here, so the token is the caller's own
    const octokit = getOctokit(req.user?.githubAccessToken);

    if (!octokit) {
      return res.status(401).json({
        message: "GitHub authentication failed. Please login again",
        action: "login required",
      });
    }

    const commits = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: Number(pull_number),
      per_page: 100,
    });

    const formattedCommits = commits.data.map((commit) => ({
      sha: commit.sha,
      // Short sha is what the UI actually prints
      shortSha: commit.sha.slice(0, 7),
      message: commit.commit.message,
      authorName: commit.commit.author?.name,
      authorLogin: commit.author?.login,
      avatarUrl: commit.author?.avatar_url,
      committedAt: commit.commit.author?.date,
      htmlUrl: commit.html_url,
    }));

    return res.status(200).json({
      message: "Successfully fetched commits",
      action: "success",
      totalCommits: formattedCommits.length,
      commits: formattedCommits,
    });
  } catch (error) {
    console.error("FetchPrCommits error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
