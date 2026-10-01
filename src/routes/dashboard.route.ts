import { Router } from "express";
import { DashboardActivity } from "../controller/dashboardActivity.controller";
import { DashboardAttention } from "../controller/dashboardAttention.controller";
import { DashboardStats } from "../controller/dashboardStats.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.get("/dashboard/stats", authMiddleware, DashboardStats);
router.get("/dashboard/attention", authMiddleware, DashboardAttention);
router.get("/dashboard/activity", authMiddleware, DashboardActivity);

export default router;
