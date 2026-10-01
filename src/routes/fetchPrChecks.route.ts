import { Router } from "express";
import { FetchPrChecks } from "../controller/fetchPrChecks.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/checks/:owner/:repo/:pull_number",
  authMiddleware,
  validate(prSchemas.detail),
  FetchPrChecks,
);

export default router;
