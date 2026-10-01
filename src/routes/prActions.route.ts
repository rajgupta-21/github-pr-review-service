import { Router } from "express";
import {
  CommentOnPr,
  MergePr,
  SubmitPrReview,
} from "../controller/prActions.controller";
import authMiddleware from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { prActionSchemas } from "../schema/request.schema";

const router = Router();

/*
Everything here changes something on GitHub, under the signed-in user's own
token, so each route is authenticated and validated.
*/

router.post(
  "/:repoId/:prNumber/comment",
  authMiddleware,
  validate(prActionSchemas.comment),
  CommentOnPr,
);

router.post(
  "/:repoId/:prNumber/review",
  authMiddleware,
  validate(prActionSchemas.review),
  SubmitPrReview,
);

router.post(
  "/:repoId/:prNumber/merge",
  authMiddleware,
  validate(prActionSchemas.merge),
  MergePr,
);

export default router;
