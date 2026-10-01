import dotenv from "dotenv";
dotenv.config();

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { Dbconnect } from "./db/db";
import aiReviewRoute from "./routes/aiReviewForPR.route";
import connectedRepos from "./routes/connectedRepos.route";
import connectToRepoRoute from "./routes/connectToRepo.route";
import dashboardRoute from "./routes/dashboard.route";
import disconnectRepoRoute from "./routes/disconnectRepo.route";
import fetchAllUserPr from "./routes/fetchAllPrs.route";
import fetchFilesChanged from "./routes/fetchFilesChanged.route";
import fetchPrChecks from "./routes/fetchPrChecks.route";
import fetchPrCommits from "./routes/fetchPrCommits.route";
import fetchPrTimeline from "./routes/fetchPrTimeline.route";
import fetchStoredReview from "./routes/fetchStoredReview.route";
import fectchPrByNumber from "./routes/fetchPrByNumber.route";
import fecthPRRepoRoute from "./routes/fetchPrForRepo.route";
import githubRoute from "./routes/github.route";
import githubWebhookRoute from "./routes/githubWebhook.route";
import LoginRoute from "./routes/login.route";
import logoutRoute from "./routes/logout.route";
import RegisterRoute from "./routes/register.route";
import RepoDataFetch from "./routes/repoDataFetch.route";
import repoHealthRoute from "./routes/repoHealth.route";
import repoOverviewRoute from "./routes/repoOverview.route";
import repoSettingsRoute from "./routes/repoSettings.route";
import UserReposRoute from "./routes/repoFetchForUser.route";
import sessionRoute from "./routes/session.route";
import workflowRoute from "./routes/workflow.route";
import workflowRunsRoute from "./routes/workflowRuns.route";
const app = express();
Dbconnect();

const PORT = process.env.PORT;
if (!PORT) {
  console.log("PORT is missing in the env ");
  process.exit(0);
}

// GitHub webhooks need the raw body for signature verification
app.use(
  "/webhooks/github",
  express.raw({ type: "application/json" }),
  githubWebhookRoute,
);

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

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
/** 
health route
**/
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
Fetch PR for a Repo 
*/
app.use("/repo", fecthPRRepoRoute);
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
Workflow run history
*/
app.use("/user", workflowRunsRoute);
app.get("/", (req, res) => {
  return res.json({
    message: "Server is healthy",
  });
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
