import { Router } from "express";
import { RepoReviews } from "../controller/repoReviews.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/reviews/:repoId",
  authMiddleware,
  validate(repoSchemas.byRepoId),
  RepoReviews,
);

export default router;
