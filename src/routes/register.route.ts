import { Router } from "express";
import { RegisterUser } from "../controller/Registeruser.controller";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { authSchemas } from "../schema/request.schema";
const router = Router();

router.post(
  "/register",
  authLimiter,
  validate(authSchemas.register),
  RegisterUser,
);
export default router;
