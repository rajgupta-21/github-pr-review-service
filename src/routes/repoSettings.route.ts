import { Router } from "express";
import { UpdateRepoSettings } from "../controller/repoSettings.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.patch("/settings/:repoId", authMiddleware, UpdateRepoSettings);

export default router;
