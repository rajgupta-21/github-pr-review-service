import { Request, Response } from "express";
import { getOctokit } from "../services/octokit.service";

/*
The Conversation tab and the Reviewers panel on the PR review screen.

Three GitHub calls — issue comments, inline review comments, and formal
reviews — merged into one list sorted oldest first, which is the order a
conversation reads in.
*/
export async function FetchPrTimeline(req: Request, res: Response) {
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

    // Fetched together — they are independent and the page needs all three
    const [issueComments, reviewComments, reviews] = await Promise.all([
      octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      }),
      octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      }),
      octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      }),
    ]);

    const timeline = [
      ...issueComments.data.map((comment) => ({
        id: `comment-${comment.id}`,
        type: "comment" as const,
        author: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
        body: comment.body,
        file: null,
        line: null,
        state: null,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      })),

      ...reviewComments.data.map((comment) => ({
        id: `review-comment-${comment.id}`,
        type: "review_comment" as const,
        author: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
        body: comment.body,
        // Inline comments are the ones that carry a file and line
        file: comment.path,
        line: comment.line ?? comment.original_line ?? null,
        state: null,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      })),

      ...reviews.data
        // A review with no state change and no body is noise on the timeline
        .filter((review) => review.state !== "PENDING")
        .map((review) => ({
          id: `review-${review.id}`,
          type: "review" as const,
          author: review.user?.login,
          avatarUrl: review.user?.avatar_url,
          body: review.body,
          file: null,
          line: null,
          // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
          state: review.state,
          createdAt: review.submitted_at,
          htmlUrl: review.html_url,
        })),
    ].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );

    /*
    One entry per reviewer showing their latest verdict — the Reviewers
    panel, which should not list the same person three times.
    */
    const latestByReviewer = new Map<string, (typeof timeline)[number]>();

    for (const entry of timeline) {
      if (entry.type !== "review" || !entry.author) continue;
      latestByReviewer.set(entry.author, entry);
    }

    const reviewers = [...latestByReviewer.values()].map((entry) => ({
      login: entry.author,
      avatarUrl: entry.avatarUrl,
      state: entry.state,
      submittedAt: entry.createdAt,
    }));

    return res.status(200).json({
      message: "Successfully fetched PR timeline",
      action: "success",
      timeline,
      reviewers,
    });
  } catch (error) {
    console.error("FetchPrTimeline error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
