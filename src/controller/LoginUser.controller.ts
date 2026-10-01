import bcrypt from "bcrypt";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserModel } from "../schema/user.schema";

export default async function LoginUser(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const checkExistingUser = await UserModel.findOne({ email }).select(
      "+password",
    );

    /*
    Same response whether the account is missing or the password is wrong.
    Distinguishing them lets an attacker enumerate which emails have
    accounts here.
    */
    const invalidCredentials = () =>
      res.status(401).json({
        message: "Incorrect email or password",
        action: "failure",
      });

    if (!checkExistingUser?.password) {
      return invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(
      password,
      checkExistingUser.password,
    );

    if (!passwordMatches) {
      return invalidCredentials();
    }

    const payload = {
      id: checkExistingUser._id,
      email: checkExistingUser.email,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Shared cookie options — see config/env.ts
    res.cookie("token", token, env.cookie);

    await UserModel.updateOne(
      { _id: checkExistingUser._id },
      { lastLogin: new Date() },
    );

    return res.status(200).json({
      message: "Successfully logged in",
      action: "success",
    });
  } catch (error) {
    console.error("Login error:", error);

    /*
    The error message is logged, not returned. It can carry database
    details that are useful to an attacker and meaningless to a user.
    */
    return res.status(500).json({
      message: "Something went wrong. Please try again",
      action: "server failure",
    });
  }
}
