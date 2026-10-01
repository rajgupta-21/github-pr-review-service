import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserModel } from "../schema/user.schema";
import { decryptToken } from "../utils/crypto.util";

export interface AuthRequest extends Request {
  user?: any;
}

export default async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized",
        action: "unauthorized",
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;

    /*
    githubAccessToken is select:false, so it has to be asked for. It is
    decrypted below and handed to handlers in plaintext, which keeps the
    ~12 call sites that read req.user.githubAccessToken working while the
    stored value stays encrypted.
    */
    const user = await UserModel.findById(decoded.id).select(
      "+githubAccessToken",
    );

    if (!user) {
      return res.status(401).json({
        message: "Session is no longer valid. Please sign in again",
        action: "unauthorized",
      });
    }

    /*
    Decrypted in memory only. Nothing calls .save() on req.user — if that
    ever changes, the plaintext would be written back to the database, so
    use services/userToken.service.ts to persist a token instead.
    */
    user.githubAccessToken = decryptToken(user.githubAccessToken) ?? undefined;

    req.user = user;

    next();
  } catch (error) {
    /*
    Separated so an expired session can be refreshed by signing in again,
    while a malformed or forged token is reported as such.
    */
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        message: "Session expired. Please sign in again",
        action: "session expired",
      });
    }

    return res.status(401).json({
      message: "Invalid session",
      action: "unauthorized",
    });
  }
}
