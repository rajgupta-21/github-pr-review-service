import { Router } from "express";
import { RepoHealth } from "../controller/repoHealth.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/health/:repoId", authMiddleware, RepoHealth);

export default router;
