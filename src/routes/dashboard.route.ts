import { Router } from "express";
import { DashboardActivity } from "../controller/dashboardActivity.controller";
import { DashboardAttention } from "../controller/dashboardAttention.controller";
import { DashboardStats } from "../controller/dashboardStats.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { dashboardSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/dashboard/stats",
  authMiddleware,
  validate(dashboardSchemas.stats),
  DashboardStats,
);
router.get(
  "/dashboard/attention",
  authMiddleware,
  validate(dashboardSchemas.attention),
  DashboardAttention,
);
router.get(
  "/dashboard/activity",
  authMiddleware,
  validate(dashboardSchemas.activity),
  DashboardActivity,
);

export default router;
