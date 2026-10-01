import { Router } from "express";
import { AiReviewForPR } from "../controller/apicallForPrReview.controller";
import authMiddleware from "../middleware/auth.middleware";
import { aiReviewLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

// Each call is a paid model request — authenticated, validated, throttled.
router.post(
  "/ai-review",
  authMiddleware,
  aiReviewLimiter,
  validate(prSchemas.aiReview),
  AiReviewForPR,
);
export default router;
