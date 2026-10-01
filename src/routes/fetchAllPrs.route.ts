import { Router } from "express";
import { FetchAllUserPr } from "../controller/fetchAllPr.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";

const router = Router();

router.get(
  "/pr-all/:userName/:repoName/:userId",
  authMiddleware,
  validate(prSchemas.listForRepo),
  FetchAllUserPr,
);
export default router;
