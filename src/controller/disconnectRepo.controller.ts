import { Request, Response } from "express";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { getOctokit } from "../services/octokit.service";

/*
Backs the "Disconnect repository" button.

Removes the GitHub webhook first, then the document. Review history is
deliberately kept — the user disconnected a repo, they did not ask to
erase what the reviews found.
*/
export async function DisconnectRepo(req: Request, res: Response) {
  try {
    const userId = req.user?._id;
    const repoId = String(req.params.repoId || "");

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

    const connectedRepo = await ConnectedRepo.findOne({
      userId,
      repoId: parsedRepoId,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Repository not connected for this user",
        action: "repo not connected",
      });
    }

    /*
    A webhook we cannot delete (token revoked, hook already gone) must not
    block the disconnect — we log it and carry on removing the document.
    */
    let webhookRemoved = false;

    if (connectedRepo.webhookId && req.user?.githubAccessToken) {
      try {
        const octokit = getOctokit(req.user.githubAccessToken);

        await octokit.rest.repos.deleteWebhook({
          owner: connectedRepo.owner,
          repo: connectedRepo.name,
          hook_id: connectedRepo.webhookId,
        });

        webhookRemoved = true;
      } catch (webhookError) {
        console.error("Webhook removal failed:", webhookError);
      }
    }

    await ConnectedRepo.deleteOne({ _id: connectedRepo._id });

    return res.status(200).json({
      message: "Repository disconnected",
      action: "success",
      webhookRemoved,
      repoId: parsedRepoId,
    });
  } catch (error) {
    console.error("DisconnectRepo error:", error);

    return res.status(500).json({
      message: "Something went wrong please try again",
      action: "server failure",
    });
  }
}
