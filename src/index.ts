/*
Config is imported first and on its own line. It validates the whole
environment and exits with a readable error if anything is missing, so
nothing else gets the chance to fail halfway through startup.
*/
import { env } from "./config/env";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Dbconnect } from "./db/db";
import { globalLimiter } from "./middleware/rateLimit.middleware";
import aiReviewRoute from "./routes/aiReviewForPR.route";
import allPullsRoute from "./routes/allPulls.route";
import connectedRepos from "./routes/connectedRepos.route";
import connectToRepoRoute from "./routes/connectToRepo.route";
import dashboardRoute from "./routes/dashboard.route";
import disconnectRepoRoute from "./routes/disconnectRepo.route";
import fetchAllUserPr from "./routes/fetchAllPrs.route";
import fetchFilesChanged from "./routes/fetchFilesChanged.route";
import fetchPrChecks from "./routes/fetchPrChecks.route";
import prActionsRoute from "./routes/prActions.route";
import fetchPrCommits from "./routes/fetchPrCommits.route";
import fetchPrTimeline from "./routes/fetchPrTimeline.route";
import fectchPrByNumber from "./routes/fetchPrByNumber.route";
import fetchStoredReview from "./routes/fetchStoredReview.route";
import findingFeedbackRoute from "./routes/findingFeedback.route";
import githubRoute from "./routes/github.route";
import githubWebhookRoute from "./routes/githubWebhook.route";
import healthRoute from "./routes/health.route";
import LoginRoute from "./routes/login.route";
import logoutRoute from "./routes/logout.route";
import RegisterRoute from "./routes/register.route";
import RepoDataFetch from "./routes/repoDataFetch.route";
import repoHealthRoute from "./routes/repoHealth.route";
import repoOverviewRoute from "./routes/repoOverview.route";
import repoReviewsRoute from "./routes/repoReviews.route";
import repoSettingsRoute from "./routes/repoSettings.route";
import UserReposRoute from "./routes/repoFetchForUser.route";
import sessionRoute from "./routes/session.route";
import workflowRoute from "./routes/workflow.route";
import workflowRunsRoute from "./routes/workflowRuns.route";

const app = express();
Dbconnect();

/*
Behind a load balancer Express sees the proxy's IP on every request,
which would make rate limiting apply to all users at once and mark
cookies insecure. Trusting one hop fixes both.
*/
if (env.isProduction) {
  app.set("trust proxy", 1);
}

/*
Security headers. The API serves JSON only, so the browser is told never
to sniff a response into something executable, and CSP is left to the
frontend which actually renders HTML.
*/
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

// GitHub webhooks need the raw body for signature verification
app.use(
  "/webhooks/github",
  express.raw({ type: "application/json" }),
  githubWebhookRoute,
);

// A body cap — without it a single request can exhaust memory
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use(
  cors({
    // Was hardcoded to localhost:3000
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// Backstop limiter; tighter per-route limits are applied in the routes
app.use(globalLimiter);

/*
Health and readiness — checks Mongo, Redis and the model provider so a
retired model or a dropped database is caught by monitoring rather than
by a user.
*/
app.use("/", healthRoute);

/*
Register Route
*/
app.use("/auth", RegisterRoute);

/**
Login Route
**/
app.use("/auth", LoginRoute);
/*
session route
*/
app.use("/auth", sessionRoute);
/*
Logout Route
*/
app.use("/auth", logoutRoute);
/*Github Route*/
app.use("/auth", githubRoute);
/*
Get User's Repo From Github
*/
app.use("/user", UserReposRoute);
/*
Connect to repo route
*/
app.use("/repo", connectToRepoRoute);
/*
connected repos
*/
app.use("/repo", connectedRepos);
/*
fetch Connected Repo Data
*/
app.use("/user", RepoDataFetch);
/*
Fetch  All PR for a Repo
*/
app.use("/repo", fetchAllUserPr);
/*
 Workflow persistence
 */
app.use("/user", workflowRoute);
/*
Fetch  PR  by Number
*/
app.use("/user", fectchPrByNumber);
/*
Fetch  filesChanged  by prNumber
*/
app.use("/pr", fetchFilesChanged);
/*
ai-review route
*/
app.use("/pr", aiReviewRoute);
/*
Every PR across every connected repository (cross-repo view)
*/
app.use("/user", allPullsRoute);
/*
Dashboard stats, attention queue and run activity
*/
app.use("/user", dashboardRoute);
/*
Connected repos enriched with health, findings and workflow state
*/
app.use("/repo", repoOverviewRoute);
/*
Repository health trend
*/
app.use("/repo", repoHealthRoute);
/*
Latest review per PR for one repository
*/
app.use("/repo", repoReviewsRoute);
/*
Repository settings (auto review, merge gate, paused)
*/
app.use("/repo", repoSettingsRoute);
/*
Disconnect a repository
*/
app.use("/repo", disconnectRepoRoute);
/*
Stored AI review for a PR (read path — does not re-run the model)
*/
app.use("/pr", fetchStoredReview);
/*
PR commits
*/
app.use("/pr", fetchPrCommits);
/*
PR conversation timeline and reviewers
*/
app.use("/pr", fetchPrTimeline);
/*
PR checks, including our merge gate
*/
app.use("/pr", fetchPrChecks);
/*
Human verdicts on AI findings (helpful / not helpful / false positive)
*/
app.use("/pr", findingFeedbackRoute);
/*
Acting on a PR: comment, approve / request changes, merge
*/
app.use("/pr", prActionsRoute);
/*
Workflow run history
*/
app.use("/user", workflowRunsRoute);

// Unknown path — answered as JSON so the client never has to parse HTML
app.use((req, res) => {
  res.status(404).json({
    message: `No route for ${req.method} ${req.path}`,
    action: "not found",
  });
});

/*
Last-resort handler. Without it an error thrown in a route leaves the
request hanging until the client times out.
*/
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, error);

    if (res.headersSent) return;

    res.status(500).json({
      message: "Something went wrong. Please try again",
      action: "server failure",
    });
  },
);

const server = app.listen(env.PORT, () => {
  console.log(`Listening on port ${env.PORT} (${env.NODE_ENV})`);
});

/*
Containers stop with SIGTERM. Closing the server lets in-flight requests
finish instead of being cut mid-review.
*/
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck connection
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
