import { Router } from "express";
import { ConnectRepo } from "../controller/connectedRepo.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { repoSchemas } from "../schema/request.schema";
const router = Router();

router.post(
  "/connect",
  authMiddleware,
  validate(repoSchemas.connect),
  ConnectRepo,
);
export default router;
