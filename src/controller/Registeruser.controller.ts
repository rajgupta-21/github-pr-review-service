import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { UserModel } from "../schema/user.schema";

export const RegisterUser = async (req: Request, res: Response) => {
  try {
    // Shape and password policy are enforced by validate(authSchemas.register)
    const { name, email, password } = req.body;

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
        action: "failure",
      });
    }

    const hashedPass = await bcrypt.hash(password, 12);

    const RegisteredUser = await UserModel.create({
      name,
      email,
      password: hashedPass,
    });

    const response = {
      _id: RegisteredUser._id,
      name: RegisteredUser.name,
      email: RegisteredUser.email,
      createdAt: RegisteredUser.createdAt,
    };

    return res.status(201).json({
      message: "Account created",
      action: "success",
      response,
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      message: "Something went wrong. Please try again",
      action: "server failure",
    });
  }
};
