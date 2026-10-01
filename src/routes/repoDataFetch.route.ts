import { Router } from "express";
import { RespondRepoData } from "../controller/repoData.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/repo/:repoId",
  authMiddleware,
  validate(repoSchemas.byRepoId),
  RespondRepoData,
);

export default router;
