import { Router } from "express";
import { UpdateRepoSettings } from "../controller/repoSettings.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.patch(
  "/settings/:repoId",
  authMiddleware,
  validate(repoSchemas.settings),
  UpdateRepoSettings,
);

export default router;
