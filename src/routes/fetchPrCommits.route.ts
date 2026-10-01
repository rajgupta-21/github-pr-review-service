import { Router } from "express";
import { FetchPrCommits } from "../controller/fetchPrCommits.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/commits/:owner/:repo/:pull_number",
  authMiddleware,
  validate(prSchemas.detail),
  FetchPrCommits,
);

export default router;
