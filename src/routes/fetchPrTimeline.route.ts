import { Router } from "express";
import { FetchPrTimeline } from "../controller/fetchPrTimeline.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/timeline/:owner/:repo/:pull_number",
  authMiddleware,
  validate(prSchemas.detail),
  FetchPrTimeline,
);

export default router;
