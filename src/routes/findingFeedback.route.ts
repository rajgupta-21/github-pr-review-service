import { Router } from "express";
import {
  GetFindingFeedback,
  SubmitFindingFeedback,
} from "../controller/findingFeedback.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { findingFeedbackSchemas } from "../schema/request.schema";

const router = Router();

router.get(
  "/feedback/:reviewId",
  authMiddleware,
  validate(findingFeedbackSchemas.list),
  GetFindingFeedback,
);

router.post(
  "/feedback/:reviewId/:findingIndex",
  authMiddleware,
  validate(findingFeedbackSchemas.submit),
  SubmitFindingFeedback,
);

export default router;
