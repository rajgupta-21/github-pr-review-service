import { Router } from "express";
import { FetchAllUserPr } from "../controller/fetchAllPr.controller";
import authMiddleware from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/pr-all/:userName/:repoName/:userId",
  authMiddleware,
  FetchAllUserPr,
);
export default router;
