import mongoose, { InferSchemaType, Model } from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },
    plan: {
      type: String,
      default: "Free",
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    githubConnected: {
      type: Boolean,
      default: false,
    },

    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },

    githubUsername: {
      type: String,
    },

    githubAvatarUrl: {
      type: String,
    },

    /*
    Encrypted at rest (utils/crypto.util.ts) and never returned by a
    default query. Code that needs it must ask explicitly with
    .select("+githubAccessToken") and decrypt — see services/userToken.service.ts.
    This token carries the GitHub `repo` scope, so a stray query that
    returned it would be handing out full source-code access.
    */
    githubAccessToken: {
      type: String,
      select: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);
export type UserType = InferSchemaType<typeof UserSchema>;
export const UserModel: Model<UserType> =
  mongoose.models.User || mongoose.model("User", UserSchema);
