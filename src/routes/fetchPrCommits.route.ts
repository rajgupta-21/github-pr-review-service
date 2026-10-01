import { Router } from "express";
import { FetchPrCommits } from "../controller/fetchPrCommits.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/commits/:owner/:repo/:pull_number", authMiddleware, FetchPrCommits);

export default router;
