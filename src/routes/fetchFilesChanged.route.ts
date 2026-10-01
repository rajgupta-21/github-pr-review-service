import { Router } from "express";
import { fecthChangedFilesForPr } from "../controller/fetchFilesChangeByPRnumber.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prSchemas } from "../schema/request.schema";
const router = Router();

router.get(
  "/files-changed/:owner/:repo/:pull_number/:userId",
  authMiddleware,
  validate(prSchemas.filesChanged),
  fecthChangedFilesForPr,
);

export default router;
