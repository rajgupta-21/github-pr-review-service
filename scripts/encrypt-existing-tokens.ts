/*
One-off migration: encrypts GitHub access tokens that were stored in
plaintext before SEC-3.

Run once after deploying the encryption change:
    bun scripts/encrypt-existing-tokens.ts

Safe to re-run — rows that are already encrypted are skipped, so an
interrupted run can simply be started again.
*/
import mongoose from "mongoose";
import { env } from "../src/config/env";
import { UserModel } from "../src/schema/user.schema";
import { encryptToken, isEncrypted } from "../src/utils/crypto.util";

async function main() {
  await mongoose.connect(env.MONGO_URL);
  console.log("Connected to MongoDB");

  // githubAccessToken is select:false, so it has to be asked for
  const users = await UserModel.find({
    githubAccessToken: { $exists: true, $ne: null },
  })
    .select("+githubAccessToken githubUsername")
    .lean();

  console.log(`Found ${users.length} user(s) with a stored token`);

  let encrypted = 0;
  let skipped = 0;

  for (const user of users) {
    const token = user.githubAccessToken;

    if (!token) {
      skipped += 1;
      continue;
    }

    if (isEncrypted(token)) {
      console.log(`  skip    ${user.githubUsername ?? user._id} (already encrypted)`);
      skipped += 1;
      continue;
    }

    await UserModel.updateOne(
      { _id: user._id },
      { githubAccessToken: encryptToken(token) },
    );

    console.log(`  encrypt ${user.githubUsername ?? user._id}`);
    encrypted += 1;
  }

  console.log(`\nDone. ${encrypted} encrypted, ${skipped} skipped.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
