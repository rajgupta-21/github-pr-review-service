import axios from "axios";
import { Router } from "express";
import { env } from "../config/env";
import { UserModel } from "../schema/user.schema";
import GenerateToken from "../utils/jwtSign.util";
import { encryptToken } from "../utils/crypto.util";

const router = Router();

router.get("/github", async (req, res) => {
  /*
  The callback is derived from API_URL so it follows the deployment
  instead of being pinned to localhost. It must match the callback URL
  registered on the GitHub OAuth app exactly.
  */
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.API_URL}/auth/github/callback`,
    scope: "read:user user:email repo",
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get("/github/callback", async (req, res) => {
  /*
  Failures redirect back to the sign-in screen with a reason rather than
  rendering JSON. A user who lands on a raw error object has no way back
  into the product.
  */
  const failRedirect = (reason: string) =>
    res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);

  try {
    const code = req.query.code as string;

    if (!code) {
      return failRedirect("GitHub did not return an authorization code");
    }

    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.API_URL}/auth/github/callback`,
      },
      { headers: { Accept: "application/json" } },
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      // GitHub reports bad/expired codes in the body, not the status
      console.error("GitHub token exchange failed:", tokenResponse.data?.error);
      return failRedirect("Could not complete GitHub sign-in");
    }

    const githubUser = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = githubUser.data;

    let existingUser = await UserModel.findOne({
      githubId: user.id.toString(),
    });

    if (!existingUser) {
      existingUser = await UserModel.create({
        // GitHub omits email when the user keeps it private
        email: user.email ?? undefined,
        githubConnected: true,
        githubId: user.id.toString(),
        githubUsername: user.login,
        githubAvatarUrl: user.avatar_url,
        githubAccessToken: encryptToken(accessToken),
        /*
        `plan` is absent for some account types. Reading user.plan.name
        unguarded threw a TypeError that surfaced as a generic "OAuth
        failed" on a user's very first sign-in.
        */
        plan: user.plan?.name ?? "Free",
      });
    } else {
      await UserModel.updateOne(
        { _id: existingUser._id },
        {
          githubAccessToken: encryptToken(accessToken),
          githubConnected: true,
          githubUsername: user.login,
          githubAvatarUrl: user.avatar_url,
          lastLogin: new Date(),
        },
      );
    }

    const jwtToken = GenerateToken({
      id: existingUser._id.toString(),
      email: existingUser.email ?? "",
    });

    res.cookie("token", jwtToken, env.cookie);

    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    return failRedirect("GitHub sign-in failed. Please try again");
  }
});

export default router;
