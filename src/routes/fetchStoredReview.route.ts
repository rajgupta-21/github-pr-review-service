import { Router } from "express";
import { FetchStoredReview } from "../controller/fetchStoredReview.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/review/:owner/:repo/:prNumber",
  authMiddleware,
  validate(prSchemas.storedReview),
  FetchStoredReview,
);

export default router;
