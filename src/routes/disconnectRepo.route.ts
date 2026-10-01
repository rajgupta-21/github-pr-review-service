import { Router } from "express";
import { DisconnectRepo } from "../controller/disconnectRepo.controller";
import authMiddleware from "../middleware/auth.middleware";
const router = Router();

router.delete("/disconnect/:repoId", authMiddleware, DisconnectRepo);

export default router;
