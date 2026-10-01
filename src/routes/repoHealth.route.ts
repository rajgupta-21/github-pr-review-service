import { Router } from "express";
import { RepoHealth } from "../controller/repoHealth.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/health/:repoId",
  authMiddleware,
  validate(repoSchemas.health),
  RepoHealth,
);

export default router;
