import { Router } from "express";
import { AiReviewForPR } from "../controller/apicallForPrReview.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.post("/ai-review", authMiddleware, AiReviewForPR);
export default router;
