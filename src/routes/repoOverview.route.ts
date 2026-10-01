import { Router } from "express";
import { RepoOverview } from "../controller/repoOverview.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/overview", authMiddleware, RepoOverview);

export default router;
