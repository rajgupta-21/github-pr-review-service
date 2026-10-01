import { Router } from "express";
import { AllPulls } from "../controller/allPulls.controller";
import authMiddleware from "../middleware/auth.middleware";

const router = Router();

router.get("/pulls", authMiddleware, AllPulls);

export default router;
