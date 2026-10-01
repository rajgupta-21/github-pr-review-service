import { Router } from "express";
import { FetchStoredReview } from "../controller/fetchStoredReview.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/review/:owner/:repo/:prNumber", authMiddleware, FetchStoredReview);

export default router;
