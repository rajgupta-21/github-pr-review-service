import { UserModel } from "../schema/user.schema";
import { decryptToken, encryptToken } from "../utils/crypto.util";

/*
The only place that reads or writes a user's GitHub token.

githubAccessToken is `select: false` and stored encrypted, so a plain
findById no longer returns anything usable. Routing every access through
here means there is one spot to audit, and callers never handle
ciphertext.
*/

/**
 * Loads a user's GitHub token, decrypted.
 * Returns null when the user has not connected GitHub, or when the stored
 * value cannot be decrypted (rotated key, tampered row) — callers treat
 * both as "needs to sign in with GitHub again".
 */
export async function getUserGithubToken(
  userId: string,
): Promise<string | null> {
  const user = await UserModel.findById(userId)
    .select("+githubAccessToken")
    .lean();

  if (!user) return null;

  return decryptToken(user.githubAccessToken);
}

/** Stores a freshly issued GitHub token, encrypted. */
export async function setUserGithubToken(userId: string, token: string) {
  await UserModel.updateOne(
    { _id: userId },
    { githubAccessToken: encryptToken(token), githubConnected: true },
  );
}

/**
 * Clears a stored token — used when GitHub rejects it, so the user is sent
 * back through sign-in rather than retrying with a dead credential.
 */
export async function clearUserGithubToken(userId: string) {
  await UserModel.updateOne(
    { _id: userId },
    { $unset: { githubAccessToken: "" }, githubConnected: false },
  );
}
