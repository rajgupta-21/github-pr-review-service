import { Router } from "express";
import { WorkflowRuns } from "../controller/workflowRuns.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/workflow/runs", authMiddleware, WorkflowRuns);

export default router;
