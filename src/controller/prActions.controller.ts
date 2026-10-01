import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { ReviewModel } from "../schema/Review.schema";
import { getOctokit } from "../services/octokit.service";

/*
Acting on a pull request without leaving the app.

Until now every one of these required opening github.com: the product
showed you what was wrong and then handed you to someone else's interface
to do anything about it. These close that loop.

All of them use the signed-in user's own GitHub token, so the comment,
approval or merge is attributed to them — not to a bot account.
*/

/** Resolves owner/repo for a connected repository the caller owns. */
async function resolveRepo(req: Request) {
  const userId = req.user?._id;
  const repoId = Number(req.params.repoId);

  const connectedRepo = await ConnectedRepo.findOne({ userId, repoId }).lean();

  return connectedRepo;
}

function requireGithub(req: Request, res: Response) {
  const accessToken = req.user?.githubAccessToken;

  if (!accessToken) {
    res.status(401).json({
      message: "GitHub account not connected. Please sign in with GitHub",
      action: "login required",
    });
    return null;
  }

  return getOctokit(accessToken);
}

/*
Posts a comment on the PR thread.

Used to reply to an AI finding. The finding is quoted back so the thread
reads as a conversation rather than a disconnected remark.
*/
export async function CommentOnPr(req: Request, res: Response) {
  try {
    const octokit = requireGithub(req, res);
    if (!octokit) return;

    const connectedRepo = await resolveRepo(req);

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    const prNumber = Number(req.params.prNumber);
    const { body, quote } = req.body;

    /*
    A quoted finding is prefixed as a blockquote so someone reading the PR
    on GitHub can tell what the reply is about.
    */
    const comment = quote ? `> ${String(quote).replace(/\n/g, "\n> ")}\n\n${body}` : body;

    const created = await octokit.rest.issues.createComment({
      owner: connectedRepo.owner,
      repo: connectedRepo.name,
      issue_number: prNumber,
      body: comment,
    });

    return res.status(201).json({
      message: "Comment posted",
      action: "success",
      comment: {
        id: created.data.id,
        body: created.data.body,
        htmlUrl: created.data.html_url,
        createdAt: created.data.created_at,
      },
    });
  } catch (error) {
    console.error("CommentOnPr error:", error);

    return res.status(500).json({
      message: "Could not post the comment. Please try again",
      action: "server failure",
    });
  }
}

/*
Submits a review: approve, request changes, or a plain comment.

GitHub rejects an APPROVE on your own pull request, which is a common and
confusing failure, so that case is reported in plain language rather than
as a raw 422.
*/
export async function SubmitPrReview(req: Request, res: Response) {
  try {
    const octokit = requireGithub(req, res);
    if (!octokit) return;

    const connectedRepo = await resolveRepo(req);

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    const prNumber = Number(req.params.prNumber);
    const { event, body } = req.body as {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body?: string;
    };

    // GitHub requires a body when asking for changes
    if (event === "REQUEST_CHANGES" && !body?.trim()) {
      return res.status(400).json({
        message: "Say what needs to change — GitHub requires a comment here",
        action: "validation failed",
      });
    }

    try {
      const created = await octokit.rest.pulls.createReview({
        owner: connectedRepo.owner,
        repo: connectedRepo.name,
        pull_number: prNumber,
        event,
        body: body || undefined,
      });

      return res.status(201).json({
        message:
          event === "APPROVE"
            ? "Pull request approved"
            : event === "REQUEST_CHANGES"
              ? "Changes requested"
              : "Review comment posted",
        action: "success",
        review: {
          id: created.data.id,
          state: created.data.state,
          htmlUrl: created.data.html_url,
        },
      });
    } catch (githubError) {
      const status = (githubError as { status?: number })?.status;

      if (status === 422) {
        return res.status(422).json({
          message:
            "GitHub would not accept this review. You cannot approve your own pull request.",
          action: "not allowed",
        });
      }

      throw githubError;
    }
  } catch (error) {
    console.error("SubmitPrReview error:", error);

    return res.status(500).json({
      message: "Could not submit the review. Please try again",
      action: "server failure",
    });
  }
}

/*
Merges the pull request.

The merge gate is enforced here, not just drawn in the UI — otherwise the
gate is decoration. `override` lets a maintainer proceed anyway, and the
reason they give is recorded on the PR so the decision is auditable.
*/
export async function MergePr(req: Request, res: Response) {
  try {
    const octokit = requireGithub(req, res);
    if (!octokit) return;

    const connectedRepo = await resolveRepo(req);

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    const prNumber = Number(req.params.prNumber);
    const { method = "merge", override, overrideReason } = req.body as {
      method?: "merge" | "squash" | "rebase";
      override?: boolean;
      overrideReason?: string;
    };

    const gate = connectedRepo.settings?.mergeGate || "Critical";

    if (gate !== "none") {
      const review = await ReviewModel.findOne({
        userId: req.user?._id,
        repoId: connectedRepo._id,
        prNumber,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (review) {
        // Everything at or above the configured severity blocks the merge
        const order = ["Low", "Medium", "High", "Critical"];
        const threshold = order.indexOf(gate);
        const blocking = (review.findings || []).filter(
          (finding) => order.indexOf(finding.severity) >= threshold,
        );

        if (blocking.length > 0 && !override) {
          return res.status(409).json({
            message: `Merge gate holds this pull request: ${blocking.length} finding(s) at ${gate} or above.`,
            action: "merge blocked",
            gate,
            blockingCount: blocking.length,
            // The client offers "Waive and merge" when this is true
            canOverride: true,
          });
        }

        /*
        An override is recorded on the PR itself. A decision to merge past
        a Critical finding should be visible to whoever reads the thread
        later, not buried in our database.
        */
        if (blocking.length > 0 && override) {
          await octokit.rest.issues.createComment({
            owner: connectedRepo.owner,
            repo: connectedRepo.name,
            issue_number: prNumber,
            body: `**Merge gate waived** by @${req.user?.githubUsername ?? "a maintainer"}.\n\n${
              blocking.length
            } finding(s) at ${gate} or above were outstanding.\n\n> ${
              overrideReason?.trim() || "No reason given."
            }`,
          });
        }
      }
    }

    try {
      const merged = await octokit.rest.pulls.merge({
        owner: connectedRepo.owner,
        repo: connectedRepo.name,
        pull_number: prNumber,
        merge_method: method,
      });

      return res.status(200).json({
        message: "Pull request merged",
        action: "success",
        merged: merged.data.merged,
        sha: merged.data.sha,
      });
    } catch (githubError) {
      const status = (githubError as { status?: number })?.status;

      // GitHub's own protections: not mergeable, or branch protection
      if (status === 405 || status === 409) {
        return res.status(409).json({
          message:
            "GitHub would not merge this pull request. It may have conflicts, failing checks, or required reviews outstanding.",
          action: "not mergeable",
        });
      }

      throw githubError;
    }
  } catch (error) {
    console.error("MergePr error:", error);

    return res.status(500).json({
      message: "Could not merge. Please try again",
      action: "server failure",
    });
  }
}
