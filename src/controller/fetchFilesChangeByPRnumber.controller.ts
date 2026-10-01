import { Request, Response } from "express";
import { UserModel } from "../schema/user.schema";
import { getOctokit } from "../services/octokit.service";
import { getUserGithubToken } from "../services/userToken.service";
import { isSameUser } from "../utils/ownership.util";

export async function fecthChangedFilesForPr(req: Request, res: Response) {
  try {
    // validate(prSchemas.filesChanged) coerces pull_number to a number
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const userId = String(req.params.userId);
    const pull_number = Number(req.params.pull_number);
    if (!pull_number || !userId || !owner || !repo) {
      return res
        .status(400)
        .json({ message: "missing credentials", action: "failure" });
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

    const files = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: Number(pull_number),
    });
    if (files.data.length === 0) {
      return res
        .status(400)
        .json({ message: "no files changed", action: "undefined" });
    }
    const filesChanged = files.data;

    return res.status(200).json({
      message: "successfully fetched files changed",
      filesChanged,
      action: "successfull",
    });
  } catch (error) {
    return res.status(500).json({
      message: "somthing went wrong please try again",
      action: "failure",
    });
  }
}
