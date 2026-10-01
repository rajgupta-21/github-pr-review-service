import { Request } from "express";

/*
Several routes still carry userId in the URL (/repo/pr-all/:userName/:repoName/:userId
and friends) because the frontend already calls them that way.

authMiddleware now runs on those routes, so the real identity is req.user.
This checks the id in the URL against it — without the check, a logged-in
user could swap the id and read another account's pull requests using that
account's GitHub token.
*/
export function isSameUser(req: Request, userIdFromParams?: string): boolean {
  if (!req.user?._id || !userIdFromParams) return false;

  return String(req.user._id) === String(userIdFromParams);
}
