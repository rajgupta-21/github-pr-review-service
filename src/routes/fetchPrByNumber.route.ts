import { Router } from "express";
import { FetchPrByNo } from "../controller/fecthPrByNumber.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";

const router = Router();
router.get(
  "/pull-request/:owner/:repo/:prNumber/:userId",
  authMiddleware,
  validate(prSchemas.byNumber),
  FetchPrByNo,
);

export default router;
