import { Router } from "express";
import LoginUser from "../controller/LoginUser.controller";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { authSchemas } from "../schema/request.schema";
const router = Router();

router.post("/login", authLimiter, validate(authSchemas.login), LoginUser);

export default router;
