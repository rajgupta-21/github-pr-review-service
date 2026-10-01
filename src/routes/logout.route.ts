import { Router } from "express";
import LogoutController from "../controller/logout.controller";
const router = Router();

router.get("/logout", LogoutController);

/*
The original route was spelled "/logut". The deployed frontend still
calls it, so the typo stays as an alias rather than breaking sign-out
for anyone on an older bundle.
*/
router.get("/logut", LogoutController);

export default router;
