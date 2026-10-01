import { Router } from "express";
import { FetchPrChecks } from "../controller/fetchPrChecks.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/checks/:owner/:repo/:pull_number", authMiddleware, FetchPrChecks);

export default router;
