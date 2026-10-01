import { Router } from "express";
import { FetchPrByNo } from "../controller/fecthPrByNumber.controller";
import authMiddleware from "../middleware/auth.middleware";

const router = Router();
router.get(
  "/pull-request/:owner/:repo/:prNumber/:userId",
  authMiddleware,
  FetchPrByNo,
);

export default router;
