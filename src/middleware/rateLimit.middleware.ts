import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

/*
Rate limits, grouped by what the route actually costs us.

Nothing was throttled before: /auth/login was open to credential
stuffing, /auth/register to mass account creation, and /pr/ai-review to
anyone willing to burn our model budget.

Limits are keyed per authenticated user where we know who is calling, and
per IP otherwise.
*/

/*
Signed-in callers are limited individually so one noisy user cannot
exhaust an office's shared IP allowance.

Anonymous callers fall back to IP, via ipKeyGenerator — it normalises an
IPv6 address to its /64 prefix. Keying on the raw address would let a
single IPv6 host rotate through its allocation and bypass the limit
entirely.
*/
function keyByUserOrIp(req: Request): string {
  const userId = req.user?._id;
  return userId ? `user:${String(userId)}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/** Sign-in and registration. Deliberately tight — these are attack surfaces. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Successful sign-ins should not count toward the lockout
  skipSuccessfulRequests: true,
  message: {
    message: "Too many attempts. Try again in 15 minutes.",
    action: "rate limited",
  },
});

/*
Every call here is a paid model request that takes ~30s. The limit is
generous for a human reviewing PRs and ruinous for a script.
*/
export const aiReviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    message:
      "Review limit reached (30 per hour). Reviews already generated are still available.",
    action: "rate limited",
  },
});

/** Workflow runs also call the model, via their review nodes. */
export const workflowRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    message: "Workflow run limit reached (60 per hour).",
    action: "rate limited",
  },
});

/*
A backstop for everything else. High enough that normal use never sees
it, low enough to blunt a scraper.
*/
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    message: "Too many requests. Slow down and try again shortly.",
    action: "rate limited",
  },
});
