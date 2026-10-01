import { Router } from "express";
import { DisconnectRepo } from "../controller/disconnectRepo.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.delete(
  "/disconnect/:repoId",
  authMiddleware,
  validate(repoSchemas.byRepoId),
  DisconnectRepo,
);

export default router;
