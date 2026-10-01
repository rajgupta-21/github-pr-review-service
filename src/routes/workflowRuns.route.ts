import { Router } from "express";
import { WorkflowRuns } from "../controller/workflowRuns.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { workflowSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/workflow/runs",
  authMiddleware,
  validate(workflowSchemas.runs),
  WorkflowRuns,
);

export default router;
