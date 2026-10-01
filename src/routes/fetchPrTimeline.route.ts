import { Router } from "express";
import { FetchPrTimeline } from "../controller/fetchPrTimeline.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get(
  "/timeline/:owner/:repo/:pull_number",
  authMiddleware,
  FetchPrTimeline,
);

export default router;
